import crypto from 'crypto';

import type { Application } from 'express';
import request from 'supertest';

import { getTestApp, getAuthToken } from '../helpers/test-app';
import { cleanupTestDatabase, getTestPrisma } from '../helpers/test-db';

describe('Staff lifecycle E2E', () => {
  let app: Application;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    app = (await getTestApp()).app;
  });
  beforeEach(async () => {
    await cleanupTestDatabase();
  });

  it('transfers active work and invalidates a removed agent access token', async () => {
    const manager = await getAuthToken(app);
    const outgoing = await getAuthToken(app, 'AGENT', manager.tenantId);
    const replacement = await getAuthToken(app, 'AGENT', manager.tenantId);
    const customer = await prisma.customer.create({
      data: {
        tenantId: manager.tenantId,
        fullName: 'Buyer',
        email: `buyer-${crypto.randomUUID()}@test.com`,
        assignedAgentId: outgoing.userId,
      },
    });
    const ticket = await prisma.ticket.create({
      data: {
        tenantId: manager.tenantId,
        customerId: customer.id,
        createdById: manager.userId,
        assignedAgentId: outgoing.userId,
        ticketNumber: 1,
        title: 'Transfer work',
        description: 'Active ticket awaiting a response.',
      },
    });

    const removed = await request(app)
      .post(`/api/v1/users/${outgoing.userId}/remove`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send({ replacementAgentId: replacement.userId });
    expect(removed.status).toBe(204);
    expect(
      (await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } }))
        .assignedAgentId,
    ).toBe(replacement.userId);
    expect(
      (await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } }))
        .assignedAgentId,
    ).toBe(replacement.userId);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: outgoing.userId } })).status,
    ).toBe('INACTIVE');
    const stale = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${outgoing.token}`);
    expect(stale.status).toBe(403);
  });

  it('unassigns active work without a replacement and leaves closed work alone', async () => {
    const manager = await getAuthToken(app);
    const outgoing = await getAuthToken(app, 'AGENT', manager.tenantId);
    const customer = await prisma.customer.create({
      data: {
        tenantId: manager.tenantId,
        fullName: 'Buyer',
        email: `buyer-${crypto.randomUUID()}@test.com`,
      },
    });
    const ticket = (ticketNumber: number, status: 'OPEN' | 'CLOSED') =>
      prisma.ticket.create({
        data: {
          tenantId: manager.tenantId,
          customerId: customer.id,
          createdById: manager.userId,
          assignedAgentId: outgoing.userId,
          ticketNumber,
          title: `Ticket ${ticketNumber}`,
          description: 'Lifecycle fixture ticket.',
          status,
        },
      });
    const open = await ticket(1, 'OPEN');
    const closed = await ticket(2, 'CLOSED');
    await prisma.refreshToken.create({
      data: {
        userId: outgoing.userId,
        tokenHash: crypto.randomUUID(),
        familyId: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await request(app)
      .post(`/api/v1/users/${outgoing.userId}/remove`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send({})
      .expect(204);

    expect(
      (await prisma.ticket.findUniqueOrThrow({ where: { id: open.id } })).assignedAgentId,
    ).toBeNull();
    // Historical attribution is preserved on finished work.
    expect(
      (await prisma.ticket.findUniqueOrThrow({ where: { id: closed.id } }))
        .assignedAgentId,
    ).toBe(outgoing.userId);
    expect(
      await prisma.refreshToken.count({
        where: { userId: outgoing.userId, isRevoked: false },
      }),
    ).toBe(0);
    // The user record is kept for history.
    expect(await prisma.user.count({ where: { id: outgoing.userId } })).toBe(1);

    const reactivate = await request(app)
      .post(`/api/v1/users/${outgoing.userId}/reactivate`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(reactivate.status).toBe(409);
  });

  it('disables and reactivates an agent, revoking sessions while disabled', async () => {
    const manager = await getAuthToken(app);
    const agent = await getAuthToken(app, 'AGENT', manager.tenantId);
    await request(app)
      .post(`/api/v1/users/${agent.userId}/disable`)
      .set('Authorization', `Bearer ${manager.token}`)
      .expect(204);
    const blocked = await request(app)
      .get('/api/v1/tickets')
      .set('Authorization', `Bearer ${agent.token}`);
    expect(blocked.status).toBe(403);

    await request(app)
      .post(`/api/v1/users/${agent.userId}/reactivate`)
      .set('Authorization', `Bearer ${manager.token}`)
      .expect(204);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: agent.userId } })).status,
    ).toBe('ACTIVE');
  });

  it('rejects lifecycle changes across organizations and by agents', async () => {
    const manager = await getAuthToken(app);
    const agent = await getAuthToken(app, 'AGENT', manager.tenantId);
    const outsider = await getAuthToken(app);
    const foreign = await request(app)
      .post(`/api/v1/users/${agent.userId}/remove`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({});
    expect(foreign.status).toBe(404);
    const colleague = await getAuthToken(app, 'AGENT', manager.tenantId);
    const byAgent = await request(app)
      .post(`/api/v1/users/${colleague.userId}/disable`)
      .set('Authorization', `Bearer ${agent.token}`);
    expect(byAgent.status).toBe(403);
    const wrongReplacement = await request(app)
      .post(`/api/v1/users/${agent.userId}/remove`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send({ replacementAgentId: outsider.userId });
    expect(wrongReplacement.status).toBe(404);
  });
});
