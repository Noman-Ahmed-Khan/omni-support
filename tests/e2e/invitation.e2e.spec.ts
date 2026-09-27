import crypto from 'crypto';

import type { Application } from 'express';
import request from 'supertest';

import { sha256 } from '../../src/shared/utils/crypto.util';
import { getTestApp, getAuthToken } from '../helpers/test-app';
import { cleanupTestDatabase, getTestPrisma } from '../helpers/test-db';

describe('Customer invitation E2E', () => {
  let app: Application;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    app = (await getTestApp()).app;
  });

  beforeEach(async () => {
    await cleanupTestDatabase();
  });

  it('links the invited customer and derives their ticket customer ID', async () => {
    const manager = await getAuthToken(app);
    const email = `buyer-${crypto.randomUUID()}@test.com`;
    const customer = await prisma.customer.create({
      data: { tenantId: manager.tenantId, fullName: 'Buyer', email },
    });
    const invited = await request(app)
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${manager.token}`)
      .send({ email, role: 'CUSTOMER', customerId: customer.id });
    expect(invited.status).toBe(201);

    // The token is deliberately email-only; stand in for receiving that email.
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.invitation.update({
      where: { id: invited.body.data.id },
      data: { tokenHash: sha256(token) },
    });
    const accepted = await request(app).post('/api/v1/invitations/accept').send({
      token,
      firstName: 'Buyer',
      lastName: 'One',
      password: 'TestPass@123!',
    });
    expect(accepted.status).toBe(204);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.tenantId).toBe(manager.tenantId);
    expect(
      await prisma.customerLink.findUnique({ where: { userId: user.id } }),
    ).toMatchObject({ customerId: customer.id, tenantId: manager.tenantId });
    const login = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'TestPass@123!',
    });
    expect(login.status).toBe(200);
    const ticket = await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({ title: 'Need help today', description: 'Please help with my new order.' });
    expect(ticket.status).toBe(201);
    expect(ticket.body.data.customerId).toBe(customer.id);
  });

  async function inviteCustomer(managerToken: string, tenantId: string, email: string) {
    const customer = await prisma.customer.create({
      data: { tenantId, fullName: 'Invited Buyer', email },
    });
    const invited = await request(app)
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ email, role: 'CUSTOMER', customerId: customer.id });
    expect(invited.status).toBe(201);
    // Invitation tokens only travel by email; stand in for receiving it.
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.invitation.update({
      where: { id: invited.body.data.id },
      data: { tokenHash: sha256(token) },
    });
    return { customer, invitationId: invited.body.data.id as string, token };
  }

  const accept = (body: Record<string, unknown>, bearer?: string) => {
    const call = request(app).post('/api/v1/invitations/accept');
    return (bearer ? call.set('Authorization', `Bearer ${bearer}`) : call).send(body);
  };

  it('links an unverified tenantless account once, replacing its password', async () => {
    const manager = await getAuthToken(app);
    const email = `existing-${crypto.randomUUID()}@test.com`;
    const argon2 = await import('argon2');
    const user = await prisma.user.create({
      data: {
        email,
        firstName: 'Existing',
        lastName: 'Buyer',
        role: 'CUSTOMER',
        status: 'PENDING_VERIFICATION',
        passwordHash: await argon2.hash('Squatter@12345'),
      },
    });
    const { token } = await inviteCustomer(manager.token, manager.tenantId, email);

    expect((await accept({ token })).status).toBe(400); // must choose a password
    expect((await accept({ token, password: 'Owner@123456' })).status).toBe(204);
    expect((await accept({ token, password: 'Owner@123456' })).status).toBe(400); // reuse

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.tenantId).toBe(manager.tenantId);
    expect(updated.emailVerifiedAt).not.toBeNull();
    expect(await prisma.customerLink.count({ where: { userId: user.id } })).toBe(1);

    const squatter = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'Squatter@12345' });
    expect(squatter.status).toBe(401);
    const owner = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'Owner@123456' });
    expect(owner.status).toBe(200);
  });

  it('requires a verified account to be signed in as itself', async () => {
    const manager = await getAuthToken(app);
    const email = `verified-${crypto.randomUUID()}@test.com`;
    const argon2 = await import('argon2');
    await prisma.user.create({
      data: {
        email,
        firstName: 'Verified',
        lastName: 'Buyer',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        passwordHash: await argon2.hash('Owner@123456'),
      },
    });
    const { token } = await inviteCustomer(manager.token, manager.tenantId, email);

    expect((await accept({ token, password: 'Wrong@123456' })).status).toBe(403);
    // Another signed-in account cannot claim the invitation.
    const other = await getAuthToken(app, 'CUSTOMER');
    expect((await accept({ token }, other.token)).status).toBe(403);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'Owner@123456' });
    expect(login.status).toBe(200);
    expect((await accept({ token }, login.body.data.accessToken)).status).toBe(204);
  });

  it('rejects expired and revoked invitations', async () => {
    const manager = await getAuthToken(app);
    const expired = await inviteCustomer(
      manager.token,
      manager.tenantId,
      `expired-${crypto.randomUUID()}@test.com`,
    );
    await prisma.invitation.update({
      where: { id: expired.invitationId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const body = { firstName: 'A', lastName: 'B', password: 'Owner@123456' };
    expect((await accept({ token: expired.token, ...body })).status).toBe(400);

    const revoked = await inviteCustomer(
      manager.token,
      manager.tenantId,
      `revoked-${crypto.randomUUID()}@test.com`,
    );
    const revoke = await request(app)
      .delete(`/api/v1/invitations/${revoked.invitationId}`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(revoke.status).toBe(204);
    expect((await accept({ token: revoked.token, ...body })).status).toBe(400);
  });

  it('keeps invitations within the inviting organization', async () => {
    const managerA = await getAuthToken(app);
    const managerB = await getAuthToken(app);
    const foreignCustomer = await prisma.customer.create({
      data: {
        tenantId: managerB.tenantId,
        fullName: 'Foreign',
        email: `foreign-${crypto.randomUUID()}@test.com`,
      },
    });
    const crossTenant = await request(app)
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${managerA.token}`)
      .send({
        email: foreignCustomer.email,
        role: 'CUSTOMER',
        customerId: foreignCustomer.id,
      });
    expect(crossTenant.status).toBe(404);

    const { invitationId } = await inviteCustomer(
      managerA.token,
      managerA.tenantId,
      `own-${crypto.randomUUID()}@test.com`,
    );
    for (const call of [
      request(app).delete(`/api/v1/invitations/${invitationId}`),
      request(app).post(`/api/v1/invitations/${invitationId}/resend`),
    ]) {
      const response = await call.set('Authorization', `Bearer ${managerB.token}`);
      expect(response.status).toBe(404);
    }
    const list = await request(app)
      .get('/api/v1/invitations')
      .set('Authorization', `Bearer ${managerB.token}`);
    expect(list.body.data).toHaveLength(0);
    // Read APIs never expose token material.
    const own = await request(app)
      .get('/api/v1/invitations')
      .set('Authorization', `Bearer ${managerA.token}`);
    expect(JSON.stringify(own.body)).not.toMatch(/token/i);
  });

  it('does not let an agent invite users', async () => {
    const agent = await getAuthToken(app, 'AGENT');
    const response = await request(app)
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ email: `x-${crypto.randomUUID()}@test.com`, role: 'AGENT' });
    expect(response.status).toBe(403);
  });
});
