import type { Application } from 'express';
import request from 'supertest';

import { getAuthToken, getPlatformAdminToken, getTestApp } from '../helpers/test-app';
import { cleanupTestDatabase, getTestPrisma } from '../helpers/test-db';

describe('Tenant channel integrations E2E', () => {
  let app: Application;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    app = (await getTestApp()).app;
  });
  beforeEach(async () => {
    await cleanupTestDatabase();
  });

  const call = (
    token: string,
    method: 'get' | 'put' | 'post' | 'delete',
    path: string,
    body?: object,
  ) =>
    request(app)
      [method](`/api/v1/integrations${path}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  it('configures a WhatsApp channel disabled until a passing test', async () => {
    const manager = await getAuthToken(app);
    const configured = await call(manager.token, 'put', '/whatsapp', {
      phoneNumber: '+1 (555) 010-2000',
      displayName: 'Support',
    });
    expect(configured.status).toBe(200);
    expect(configured.body.data).toMatchObject({
      provider: 'whatsapp',
      isEnabled: false,
      config: { phoneNumber: '+15550102000' },
      hasSigningSecret: false,
    });

    // The shared Twilio credentials are not configured in tests, so the test fails
    // and the channel cannot be enabled.
    const test = await call(manager.token, 'post', '/whatsapp/test');
    expect(test.status).toBe(200);
    expect(test.body.data.status).toBe('FAILED');
    const enable = await call(manager.token, 'post', '/whatsapp/enable');
    expect(enable.status).toBe(409);
  });

  it('enables a channel after a passing test and requires a re-test after changes', async () => {
    const manager = await getAuthToken(app);
    await call(manager.token, 'put', '/whatsapp', { phoneNumber: '+15550102001' });
    const integration = await prisma.tenantIntegration.findFirstOrThrow({
      where: { tenantId: manager.tenantId, provider: 'whatsapp' },
    });
    // Stand in for a successful test against real provider credentials.
    await prisma.tenantIntegration.update({
      where: { id: integration.id },
      data: {
        metadata: {
          configVersion: 1,
          testedConfigVersion: 1,
          lastTest: {
            status: 'SUCCEEDED',
            checkedAt: new Date().toISOString(),
            message: 'ok',
          },
        },
      },
    });
    const enabled = await call(manager.token, 'post', '/whatsapp/enable');
    expect(enabled.status).toBe(200);
    expect(enabled.body.data.isEnabled).toBe(true);

    const disabled = await call(manager.token, 'post', '/whatsapp/disable');
    expect(disabled.body.data.isEnabled).toBe(false);

    await call(manager.token, 'put', '/whatsapp', { phoneNumber: '+15550102002' });
    expect((await call(manager.token, 'post', '/whatsapp/enable')).status).toBe(409);
  });

  it('never returns the signing secret from read APIs', async () => {
    const manager = await getAuthToken(app);
    await call(manager.token, 'put', '/email', {
      fromName: 'Acme Support',
      replyTo: 'help@acme.test',
    });
    const rotated = await call(manager.token, 'post', '/email/rotate-secret');
    expect(rotated.status).toBe(200);
    expect(rotated.headers['cache-control']).toBe('no-store');
    const secret = rotated.body.data.secret as string;
    expect(secret.length).toBeGreaterThan(30);

    const stored = await prisma.tenantIntegration.findFirstOrThrow({
      where: { tenantId: manager.tenantId, provider: 'email' },
    });
    expect(stored.webhookSecret).not.toContain(secret);

    const admin = await getPlatformAdminToken();
    for (const response of [
      await call(manager.token, 'get', ''),
      await call(manager.token, 'get', '/email'),
      await request(app)
        .get('/api/v1/admin/integrations')
        .set('Authorization', `Bearer ${admin.token}`),
    ]) {
      expect(response.status).toBe(200);
      const text = JSON.stringify(response.body);
      expect(text).not.toContain(secret);
      expect(text).not.toContain(stored.webhookSecret!);
      expect(text).toContain('"hasSigningSecret":true');
    }
  });

  it('keeps a WhatsApp number to one organization', async () => {
    const managerA = await getAuthToken(app);
    const managerB = await getAuthToken(app);
    await call(managerA.token, 'put', '/whatsapp', { phoneNumber: '+15550109999' });
    const duplicate = await call(managerB.token, 'put', '/whatsapp', {
      phoneNumber: '+1 555 010 9999',
    });
    expect(duplicate.status).toBe(409);
  });

  it('is limited to managers of the organization', async () => {
    const manager = await getAuthToken(app);
    const agent = await getAuthToken(app, 'AGENT', manager.tenantId);
    const other = await getAuthToken(app);
    await call(manager.token, 'put', '/email', { fromName: 'Acme' });

    expect((await call(agent.token, 'get', '')).status).toBe(403);
    expect(
      (await call(agent.token, 'put', '/email', { fromName: 'Hijack' })).status,
    ).toBe(403);
    const foreign = await call(other.token, 'get', '/email');
    expect(foreign.status).toBe(404);
    expect((await call(manager.token, 'put', '/slack', {})).status).toBe(400);
    expect(
      (await call(manager.token, 'put', '/email', { fromName: 'x', smtpPassword: 'y' }))
        .status,
    ).toBe(400);
  });
});
