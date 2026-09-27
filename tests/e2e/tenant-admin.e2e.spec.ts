import crypto from 'crypto';

import type { Application } from 'express';
import request from 'supertest';

import { getAuthToken, getPlatformAdminToken, getTestApp } from '../helpers/test-app';
import { cleanupTestDatabase, getTestPrisma } from '../helpers/test-db';

describe('Tenant administration E2E', () => {
  let app: Application;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    app = (await getTestApp()).app;
  });
  beforeEach(async () => {
    await cleanupTestDatabase();
  });

  it('applies every accepted tenant field', async () => {
    const admin = await getPlatformAdminToken();
    const manager = await getAuthToken(app);
    const domain = `${crypto.randomUUID()}.example.com`;
    const response = await request(app)
      .patch(`/api/v1/tenants/${manager.tenantId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'Renamed Org',
        domain,
        plan: 'enterprise',
        maxAgents: 42,
        maxCustomers: 4200,
        maxTicketsPerDay: 900,
        settings: { timezone: 'UTC' },
      });
    expect(response.status).toBe(200);
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: manager.tenantId },
    });
    expect(tenant).toMatchObject({
      name: 'Renamed Org',
      domain,
      plan: 'enterprise',
      maxAgents: 42,
      maxCustomers: 4200,
      maxTicketsPerDay: 900,
    });
  });

  it('rejects unsupported fields and duplicate domains', async () => {
    const admin = await getPlatformAdminToken();
    const first = await getAuthToken(app);
    const second = await getAuthToken(app);
    const unsupported = await request(app)
      .patch(`/api/v1/tenants/${first.tenantId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'ACTIVE' });
    expect(unsupported.status).toBe(400);

    const domain = `${crypto.randomUUID()}.example.com`;
    await request(app)
      .patch(`/api/v1/tenants/${first.tenantId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ domain })
      .expect(200);
    const duplicate = await request(app)
      .patch(`/api/v1/tenants/${second.tenantId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ domain });
    expect(duplicate.status).toBe(409);
  });
});
