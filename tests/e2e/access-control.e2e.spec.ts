import crypto from 'crypto';

import argon2 from 'argon2';
import type { Application } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { createTestCustomer, createTestTicket } from '../fixtures/ticket.fixture';
import { getTestApp } from '../helpers/test-app';
import { cleanupTestDatabase, getTestPrisma } from '../helpers/test-db';

/**
 * Row-level access inside an organization (SEC-09/10/13), search (BUG-34) and the
 * WhatsApp webhook signature check (SEC-12).
 */
describe('Access control E2E', () => {
  let app: Application;
  const prisma = getTestPrisma();

  const PNG_BYTES = Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    Buffer.alloc(32, 1),
  ]).toString('base64');

  function tokenFor(user: {
    id: string;
    email: string;
    role: string;
    tenantId: string | null;
  }) {
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId ?? undefined,
        type: 'access',
      },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: '15m', issuer: 'omnisupport', audience: 'omnisupport-api' },
    );
  }

  async function createUser(role: string, tenantId: string, email?: string) {
    const user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        email: email ?? `${role.toLowerCase()}-${crypto.randomUUID()}@test.com`,
        passwordHash: await argon2.hash('TestPass@123!'),
        firstName: 'Test',
        lastName: role,
        role: role as never,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
    return { ...user, token: tokenFor(user) };
  }

  async function createTenant() {
    return prisma.tenant.create({
      data: {
        id: crypto.randomUUID(),
        name: `Org ${crypto.randomUUID()}`,
        slug: `org-${crypto.randomUUID()}`,
        status: 'ACTIVE',
        plan: 'starter',
        maxAgents: 10,
        maxCustomers: 1000,
        maxTicketsPerDay: 500,
      },
    });
  }

  let tenantId: string;
  let manager: Awaited<ReturnType<typeof createUser>>;
  let agent: Awaited<ReturnType<typeof createUser>>;
  let otherAgent: Awaited<ReturnType<typeof createUser>>;
  let customerUser: Awaited<ReturnType<typeof createUser>>;
  let ownTicketId: string;
  let foreignTicketId: string;

  beforeAll(async () => {
    app = (await getTestApp()).app;
  });

  beforeEach(async () => {
    await cleanupTestDatabase();

    tenantId = (await createTenant()).id;
    manager = await createUser('TENANT_MANAGER', tenantId);
    agent = await createUser('AGENT', tenantId);
    otherAgent = await createUser('AGENT', tenantId);

    const email = `buyer-${crypto.randomUUID()}@test.com`;
    customerUser = await createUser('CUSTOMER', tenantId, email);
    const ownCustomer = await createTestCustomer(prisma, tenantId, { email });
    const otherCustomer = await createTestCustomer(prisma, tenantId, {
      email: `other-${crypto.randomUUID()}@test.com`,
    });

    ownTicketId = (
      await createTestTicket(prisma, tenantId, ownCustomer.id, manager.id, {
        assignedAgentId: agent.id,
        title: 'Router keeps rebooting',
        description: 'The router reboots every few minutes',
      })
    ).id;
    foreignTicketId = (
      await createTestTicket(prisma, tenantId, otherCustomer.id, manager.id, {
        assignedAgentId: otherAgent.id,
        title: 'Invoice question',
        description: 'Why was I charged twice this month',
      })
    ).id;
  });

  describe('customers (SEC-09)', () => {
    it('lists only the tickets of their own customer record', async () => {
      const response = await request(app)
        .get('/api/v1/tickets')
        .set('Authorization', `Bearer ${customerUser.token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.map((t: { id: string }) => t.id)).toEqual([ownTicketId]);
    });

    it('cannot read, comment on or see the history of another customer ticket', async () => {
      const auth = `Bearer ${customerUser.token}`;

      const read = await request(app)
        .get(`/api/v1/tickets/${foreignTicketId}`)
        .set('Authorization', auth);
      const history = await request(app)
        .get(`/api/v1/tickets/${foreignTicketId}/history`)
        .set('Authorization', auth);
      const comment = await request(app)
        .post(`/api/v1/tickets/${foreignTicketId}/comments`)
        .set('Authorization', auth)
        .send({ content: 'Hello', type: 'PUBLIC' });

      expect([read.status, history.status, comment.status]).toEqual([403, 403, 403]);
    });

    it('files new tickets under their own record, ignoring triage fields', async () => {
      const otherCustomer = await createTestCustomer(prisma, tenantId, {
        email: `x-${crypto.randomUUID()}@test.com`,
      });

      const response = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${customerUser.token}`)
        .send({
          customerId: otherCustomer.id,
          title: 'My new problem',
          description: 'Something else is broken now',
          priority: 'CRITICAL',
          assignedAgentId: agent.id,
        });

      expect(response.status).toBe(201);
      const ticket = await prisma.ticket.findUniqueOrThrow({
        where: { id: response.body.data.id },
      });
      expect(ticket.customerId).not.toBe(otherCustomer.id);
      expect(ticket.priority).toBe('MEDIUM');
      expect(ticket.assignedAgentId).toBeNull();
    });

    it('has no access to customer records or search', async () => {
      const auth = `Bearer ${customerUser.token}`;
      const customers = await request(app)
        .get('/api/v1/customers')
        .set('Authorization', auth);
      const search = await request(app)
        .get('/api/v1/search?q=router')
        .set('Authorization', auth);

      expect(customers.status).toBe(403);
      expect(search.status).toBe(403);
    });
  });

  describe('agents (SEC-09)', () => {
    it('cannot see the history of a ticket assigned to another agent', async () => {
      const response = await request(app)
        .get(`/api/v1/tickets/${foreignTicketId}/history`)
        .set('Authorization', `Bearer ${agent.token}`);

      expect(response.status).toBe(403);
    });

    it('cannot queue AI work for a ticket assigned to another agent (SEC-10)', async () => {
      const response = await request(app)
        .post(`/api/v1/ai/tickets/${foreignTicketId}/summarize`)
        .set('Authorization', `Bearer ${agent.token}`)
        .send({});

      expect(response.status).toBe(403);
    });
  });

  describe('search (BUG-34)', () => {
    it('finds tickets by their text and scopes agents to assigned tickets', async () => {
      const managerSearch = await request(app)
        .get('/api/v1/search?q=router reboots&types=ticket')
        .set('Authorization', `Bearer ${manager.token}`);
      const agentSearch = await request(app)
        .get('/api/v1/search?q=invoice charged&types=ticket')
        .set('Authorization', `Bearer ${agent.token}`);

      expect(managerSearch.status).toBe(200);
      expect(managerSearch.body.data.map((r: { id: string }) => r.id)).toEqual([
        ownTicketId,
      ]);
      expect(agentSearch.status).toBe(200);
      expect(agentSearch.body.data).toEqual([]);
    });

    it('accepts arbitrary search text without failing', async () => {
      const response = await request(app)
        .get(`/api/v1/search?q=${encodeURIComponent("it's & | ! (broken")}`)
        .set('Authorization', `Bearer ${manager.token}`);

      expect(response.status).toBe(200);
    });
  });

  describe('attachments (SEC-13)', () => {
    it('rejects a ticket from another organization', async () => {
      const otherTenant = await createTenant();
      const otherManager = await createUser('TENANT_MANAGER', otherTenant.id);

      const response = await request(app)
        .post('/api/v1/attachments/upload')
        .set('Authorization', `Bearer ${otherManager.token}`)
        .send({
          filename: 'shot.png',
          mimeType: 'image/png',
          base64Content: PNG_BYTES,
          ticketId: ownTicketId,
        });

      expect(response.status).toBe(404);
    });

    it('rejects content that does not match the declared type', async () => {
      const response = await request(app)
        .post('/api/v1/attachments/upload')
        .set('Authorization', `Bearer ${manager.token}`)
        .send({
          filename: 'totally-a-picture.png',
          mimeType: 'image/png',
          base64Content: Buffer.from('MZ\x90\x00 executable').toString('base64'),
          ticketId: ownTicketId,
        });

      expect(response.status).toBe(400);
    });

    it('stores unscanned uploads as PENDING and hides them from other agents', async () => {
      const upload = await request(app)
        .post('/api/v1/attachments/upload')
        .set('Authorization', `Bearer ${manager.token}`)
        .send({
          filename: 'shot.png',
          mimeType: 'image/png',
          base64Content: PNG_BYTES,
          ticketId: ownTicketId,
        });

      expect(upload.status).toBe(201);
      expect(upload.body.data.status).toBe('PENDING');

      const denied = await request(app)
        .get(`/api/v1/attachments/${upload.body.data.id}/download-url`)
        .set('Authorization', `Bearer ${otherAgent.token}`);
      const allowed = await request(app)
        .get(`/api/v1/attachments/${upload.body.data.id}/download-url`)
        .set('Authorization', `Bearer ${agent.token}`);

      expect(denied.status).toBe(403);
      expect(allowed.status).toBe(200);
    });
  });

  describe('WhatsApp webhook (SEC-12)', () => {
    it('rejects requests without a valid Twilio signature', async () => {
      for (const path of ['/inbound', '/status']) {
        const response = await request(app)
          .post(`/api/v1/webhooks/whatsapp${path}`)
          .set('X-Twilio-Signature', 'forged')
          .type('form')
          .send({ From: 'whatsapp:+15550001', To: 'whatsapp:+15550002', Body: 'hi' });

        expect(response.status).toBe(403);
      }

      expect(await prisma.webhookEvent.count()).toBe(0);
    });
  });
});
