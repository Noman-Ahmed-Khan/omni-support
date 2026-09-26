import crypto from 'crypto';

import argon2 from 'argon2';
import type { Application } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { createTestCustomer } from '../fixtures/ticket.fixture';
import { getAuthToken, getTestApp } from '../helpers/test-app';
import { cleanupTestDatabase, getTestPrisma } from '../helpers/test-db';

/**
 * Regression suite for authorization and tenant isolation defects found in the audit
 * (SEC-01, SEC-02, SEC-03, SEC-16) and related hardening.
 */
describe('Authorization & tenant isolation E2E', () => {
  let app: Application;
  const prisma = getTestPrisma();

  function signToken(user: {
    id: string;
    email: string;
    role: string;
    tenantId?: string | null;
  }): string {
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

  async function createUser(role: string, tenantId: string | null) {
    return prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        email: `${role.toLowerCase()}-${crypto.randomUUID()}@test.com`,
        passwordHash: await argon2.hash('TestPass@123!'),
        firstName: 'Test',
        lastName: role,
        role: role as never,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
  }

  beforeAll(async () => {
    app = (await getTestApp()).app;
  });

  beforeEach(async () => {
    await cleanupTestDatabase();
  });

  describe('role changes (SEC-01)', () => {
    it('forbids a tenant manager from promoting themselves to PLATFORM_ADMIN', async () => {
      const manager = await getAuthToken(app, 'TENANT_MANAGER');

      const response = await request(app)
        .put(`/api/v1/users/${manager.userId}/role`)
        .set('Authorization', `Bearer ${manager.token}`)
        .send({ role: 'PLATFORM_ADMIN' });

      expect(response.status).toBe(403);
      const stored = await prisma.user.findUniqueOrThrow({
        where: { id: manager.userId },
      });
      expect(stored.role).toBe('TENANT_MANAGER');
    });

    it('forbids a tenant manager from granting PLATFORM_ADMIN to another user', async () => {
      const manager = await getAuthToken(app, 'TENANT_MANAGER');
      const agent = await createUser('AGENT', manager.tenantId);

      const response = await request(app)
        .put(`/api/v1/users/${agent.id}/role`)
        .set('Authorization', `Bearer ${manager.token}`)
        .send({ role: 'PLATFORM_ADMIN' });

      expect(response.status).toBe(403);
    });

    it('lets a tenant manager demote an agent to customer and records an audit entry', async () => {
      const manager = await getAuthToken(app, 'TENANT_MANAGER');
      const agent = await createUser('AGENT', manager.tenantId);

      const response = await request(app)
        .put(`/api/v1/users/${agent.id}/role`)
        .set('Authorization', `Bearer ${manager.token}`)
        .send({ role: 'CUSTOMER' });

      expect(response.status).toBe(200);
      expect(response.body.data.role).toBe('CUSTOMER');

      const audit = await prisma.auditLog.findFirst({
        where: { resourceId: agent.id, action: 'ROLE_CHANGE' },
      });
      expect(audit).not.toBeNull();
    });
  });

  describe('self-registered accounts (SEC-02)', () => {
    it('creates a CUSTOMER account without organization or staff access', async () => {
      const register = await request(app).post('/api/v1/auth/register').send({
        email: 'selfsignup@example.com',
        password: 'TestPass@123!',
        firstName: 'Self',
        lastName: 'Signup',
      });
      expect(register.status).toBe(202);

      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'selfsignup@example.com' },
      });
      expect(user.role).toBe('CUSTOMER');
      expect(user.tenantId).toBeNull();
    });

    it('does not let a tenant-less user list or read platform users', async () => {
      await getAuthToken(app, 'TENANT_MANAGER'); // another tenant's user exists
      const loner = await createUser('AGENT', null);
      const token = signToken(loner);

      const list = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${token}`);
      expect(list.status).toBe(403);

      const me = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${token}`);
      expect(me.status).toBe(200);
      expect(me.body.data.id).toBe(loner.id);
    });
  });

  describe('tenant context is required for tenant data (SEC-03)', () => {
    it.each([
      ['GET', '/api/v1/attachments/00000000-0000-4000-8000-000000000000/download-url'],
      ['GET', '/api/v1/ai/tickets/00000000-0000-4000-8000-000000000000/results'],
      ['DELETE', '/api/v1/comments/00000000-0000-4000-8000-000000000000'],
      ['GET', '/api/v1/tickets'],
      ['GET', '/api/v1/customers'],
    ])('rejects a platform admin without tenant context: %s %s', async (method, path) => {
      const admin = await createUser('PLATFORM_ADMIN', null);
      const token = signToken(admin);

      const response = await request(app)
        [method.toLowerCase() as 'get' | 'delete'](path)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it('does not return another tenant attachment', async () => {
      const tenantA = await getAuthToken(app, 'TENANT_MANAGER');
      const tenantB = await getAuthToken(app, 'TENANT_MANAGER');

      const attachment = await prisma.attachment.create({
        data: {
          tenantId: tenantA.tenantId,
          uploadedById: tenantA.userId,
          filename: 'secret.pdf',
          originalName: 'secret.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 10,
          storageProvider: 'LOCAL',
          storagePath: `${tenantA.tenantId}/secret.pdf`,
          publicUrl: 'http://localhost/uploads/secret.pdf',
          status: 'CLEAN',
        },
      });

      const response = await request(app)
        .get(`/api/v1/attachments/${attachment.id}/download-url`)
        .set('Authorization', `Bearer ${tenantB.token}`);

      expect(response.status).toBe(404);
    });
  });

  describe('organization details (SEC-16)', () => {
    it('forbids a tenant manager from reading another organization', async () => {
      const tenantA = await getAuthToken(app, 'TENANT_MANAGER');
      const tenantB = await getAuthToken(app, 'TENANT_MANAGER');

      const other = await request(app)
        .get(`/api/v1/tenants/${tenantB.tenantId}`)
        .set('Authorization', `Bearer ${tenantA.token}`);
      expect(other.status).toBe(403);

      const own = await request(app)
        .get(`/api/v1/tenants/${tenantA.tenantId}`)
        .set('Authorization', `Bearer ${tenantA.token}`);
      expect(own.status).toBe(200);
    });
  });

  describe('suspended organizations', () => {
    it('blocks tenant routes for users of a suspended organization', async () => {
      const manager = await getAuthToken(app, 'TENANT_MANAGER');
      await prisma.tenant.update({
        where: { id: manager.tenantId },
        data: { status: 'SUSPENDED', suspendedAt: new Date() },
      });

      const tickets = await request(app)
        .get('/api/v1/tickets')
        .set('Authorization', `Bearer ${manager.token}`);
      expect(tickets.status).toBe(403);

      const users = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${manager.token}`);
      expect(users.status).toBe(403);
    });
  });

  describe('comment editing', () => {
    it('edits and deletes a comment and records activity (BUG-03)', async () => {
      const manager = await getAuthToken(app, 'TENANT_MANAGER');
      const customer = await createTestCustomer(prisma, manager.tenantId);

      const ticket = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${manager.token}`)
        .send({
          customerId: customer.id,
          title: 'Edit comment ticket',
          description: 'Ticket used to verify comment editing',
        });
      expect(ticket.status).toBe(201);

      const comment = await request(app)
        .post(`/api/v1/tickets/${ticket.body.data.id}/comments`)
        .set('Authorization', `Bearer ${manager.token}`)
        .send({ content: 'Original comment', type: 'PUBLIC' });
      expect(comment.status).toBe(201);

      const edited = await request(app)
        .put(`/api/v1/comments/${comment.body.data.id}`)
        .set('Authorization', `Bearer ${manager.token}`)
        .send({ content: 'Edited comment' });
      expect(edited.status).toBe(200);

      const deleted = await request(app)
        .delete(`/api/v1/comments/${comment.body.data.id}`)
        .set('Authorization', `Bearer ${manager.token}`);
      expect(deleted.status).toBe(204);

      const activity = await prisma.activityLog.findMany({
        where: {
          ticketId: ticket.body.data.id,
          eventType: { in: ['COMMENT_EDITED', 'COMMENT_DELETED'] },
        },
      });
      expect(activity.map((a) => a.eventType).sort()).toEqual([
        'COMMENT_DELETED',
        'COMMENT_EDITED',
      ]);
    });

    it('writes domain events for new tickets and comments to the outbox', async () => {
      const manager = await getAuthToken(app, 'TENANT_MANAGER');
      const customer = await createTestCustomer(prisma, manager.tenantId);

      const ticket = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${manager.token}`)
        .send({
          customerId: customer.id,
          title: 'Outbox ticket',
          description: 'Ticket used to verify event publishing',
        });

      await request(app)
        .post(`/api/v1/tickets/${ticket.body.data.id}/comments`)
        .set('Authorization', `Bearer ${manager.token}`)
        .send({ content: 'Hello', type: 'PUBLIC' });

      const events = await prisma.outboxEvent.findMany({
        where: { tenantId: manager.tenantId },
      });
      const types = events.map((e) => e.eventType);
      expect(types).toEqual(expect.arrayContaining(['TICKET_CREATED', 'COMMENT_ADDED']));
    });
  });

  it('reports that report generation is not available (501)', async () => {
    const manager = await getAuthToken(app, 'TENANT_MANAGER');
    const response = await request(app)
      .post('/api/v1/reports/generate')
      .set('Authorization', `Bearer ${manager.token}`)
      .send({ jobType: 'summary' });
    expect(response.status).toBe(501);
  });
});
