import crypto from 'crypto';

import type { Application } from 'express';
import request from 'supertest';

import { getAuthToken, getPlatformAdminToken, getTestApp } from '../helpers/test-app';
import { cleanupTestDatabase, getTestPrisma } from '../helpers/test-db';

describe('Platform operations E2E', () => {
  let app: Application;
  const prisma = getTestPrisma();
  const reason = 'Customer escalation INC-1234: redeliver notification';

  beforeAll(async () => {
    app = (await getTestApp()).app;
  });
  beforeEach(async () => {
    await cleanupTestDatabase();
  });

  const createOutbox = (status: string, extra: Record<string, unknown> = {}) =>
    prisma.outboxEvent.create({
      data: {
        id: crypto.randomUUID(),
        eventId: crypto.randomUUID(),
        eventType: 'ticket.created',
        occurredAt: new Date(),
        payload: {
          ticketId: crypto.randomUUID(),
          customerEmail: 'person@example.com',
          phone: '+15550100000',
          apiToken: 'secret-token',
        },
        status,
        attempts: status === 'DEAD_LETTER' ? 5 : 0,
        ...extra,
      },
    });

  const post = (token: string, path: string, body: object = { reason }) =>
    request(app)
      .post(`/api/v1/admin${path}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  it('redacts personal data and secrets and audits record views', async () => {
    const admin = await getPlatformAdminToken();
    const event = await createOutbox('PROCESSED');
    const detail = await request(app)
      .get(`/api/v1/admin/outbox/${event.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(detail.status).toBe(200);
    const text = JSON.stringify(detail.body);
    expect(text).not.toContain('person@example.com');
    expect(text).not.toContain('+15550100000');
    expect(text).not.toContain('secret-token');
    expect(detail.body.data.payload.ticketId).toBeDefined();

    const views = await prisma.auditLog.count({
      where: { actorId: admin.userId, action: 'VIEW', resourceId: event.id },
    });
    expect(views).toBe(1);
  });

  it('filters outbox records', async () => {
    const admin = await getPlatformAdminToken();
    await createOutbox('PROCESSED');
    await createOutbox('DEAD_LETTER');
    const list = await request(app)
      .get('/api/v1/admin/outbox?status=DEAD_LETTER')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta.total).toBe(1);
  });

  it('requires a reason and retries only failed events', async () => {
    const admin = await getPlatformAdminToken();
    const dead = await createOutbox('DEAD_LETTER');
    expect((await post(admin.token, `/outbox/${dead.id}/retry`, {})).status).toBe(400);
    expect(
      (await post(admin.token, `/outbox/${dead.id}/retry`, { reason: 'short' })).status,
    ).toBe(400);

    const retried = await post(admin.token, `/outbox/${dead.id}/retry`);
    expect(retried.status).toBe(202);
    const row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: dead.id } });
    expect(row.status).toBe('PENDING');
    expect(row.maxAttempts).toBeGreaterThan(row.attempts);

    const processed = await createOutbox('PROCESSED');
    expect((await post(admin.token, `/outbox/${processed.id}/retry`)).status).toBe(409);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { resource: 'operations.outbox', resourceId: dead.id, action: 'UPDATE' },
    });
    expect(audit.metadata).toMatchObject({ action: 'RETRY', reason });
  });

  it('replays as a new event, keeps the original immutable and blocks duplicates', async () => {
    const admin = await getPlatformAdminToken();
    const original = await createOutbox('PROCESSED');

    const [first, second] = await Promise.all([
      post(admin.token, `/outbox/${original.id}/replay`),
      post(admin.token, `/outbox/${original.id}/replay`),
    ]);
    expect([first.status, second.status].sort()).toEqual([202, 409]);

    const replays = await prisma.outboxEvent.findMany({
      where: { replayOfId: original.id },
    });
    expect(replays).toHaveLength(1);
    expect(replays[0].id).not.toBe(original.id);
    expect(replays[0].eventId).not.toBe(original.eventId);
    expect(replays[0].payload).toEqual(original.payload);
    expect(replays[0].status).toBe('PENDING');

    const unchanged = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id: original.id },
    });
    expect(unchanged).toEqual(original);

    // Once the replay finishes, another replay is allowed.
    await prisma.outboxEvent.update({
      where: { id: replays[0].id },
      data: { status: 'PROCESSED' },
    });
    expect((await post(admin.token, `/outbox/${original.id}/replay`)).status).toBe(202);

    const interventions = await request(app)
      .get(
        `/api/v1/admin/operations/interventions?targetType=outbox&targetId=${original.id}`,
      )
      .set('Authorization', `Bearer ${admin.token}`);
    expect(interventions.body.data).toHaveLength(2);
    expect(interventions.body.data[0]).toMatchObject({ action: 'REPLAY', reason });
  });

  it('cancels pending events but never one a worker is processing', async () => {
    const admin = await getPlatformAdminToken();
    const pending = await createOutbox('PENDING');
    expect((await post(admin.token, `/outbox/${pending.id}/cancel`)).status).toBe(200);
    expect(
      (await prisma.outboxEvent.findUniqueOrThrow({ where: { id: pending.id } })).status,
    ).toBe('CANCELLED');
    // Cancelled is terminal.
    expect((await post(admin.token, `/outbox/${pending.id}/retry`)).status).toBe(409);

    const processing = await createOutbox('PROCESSING', {
      lockedAt: new Date(),
      lockedBy: 'worker-1',
    });
    expect((await post(admin.token, `/outbox/${processing.id}/cancel`)).status).toBe(409);
  });

  it('retries a webhook once under concurrent operators', async () => {
    const admin = await getPlatformAdminToken();
    const event = await prisma.webhookEvent.create({
      data: {
        eventType: 'WHATSAPP_INBOUND',
        provider: 'twilio',
        payload: {
          From: 'whatsapp:+15550100001',
          To: 'whatsapp:+15550100002',
          Body: 'hi',
        },
        status: 'FAILED',
        error: 'boom',
      },
    });
    const [first, second] = await Promise.all([
      post(admin.token, `/webhooks/${event.id}/retry`),
      post(admin.token, `/webhooks/${event.id}/retry`),
    ]);
    const statuses = [first.status, second.status].sort();
    // Either both ran one after the other (the first finished before the second
    // claimed) or the second saw the row locked; never two concurrent runs.
    expect(statuses[0]).toBe(200);
    const row = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(row.lockedBy).toBeNull();
    expect(['SKIPPED', 'FAILED', 'PROCESSED']).toContain(row.status);

    const detail = await request(app)
      .get(`/api/v1/admin/webhooks/${event.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(JSON.stringify(detail.body)).not.toContain('+15550100001');
    expect(JSON.stringify(detail.body)).not.toContain('"hi"');
  });

  it('replays webhooks as separate rows and cancels retryable ones', async () => {
    const admin = await getPlatformAdminToken();
    const processed = await prisma.webhookEvent.create({
      data: {
        eventType: 'WHATSAPP_INBOUND',
        provider: 'twilio',
        payload: { From: 'whatsapp:+1', To: 'whatsapp:+2', Body: 'x' },
        status: 'PROCESSED',
        processed: true,
      },
    });
    const replay = await post(admin.token, `/webhooks/${processed.id}/replay`);
    expect(replay.status).toBe(200);
    const copy = await prisma.webhookEvent.findFirstOrThrow({
      where: { replayOfId: processed.id },
    });
    expect(copy.payload).toEqual(processed.payload);
    expect(
      (await prisma.webhookEvent.findUniqueOrThrow({ where: { id: processed.id } }))
        .status,
    ).toBe('PROCESSED');

    const status = await prisma.webhookEvent.create({
      data: {
        eventType: 'WHATSAPP_STATUS',
        provider: 'twilio',
        payload: {},
        status: 'RECEIVED',
      },
    });
    expect((await post(admin.token, `/webhooks/${status.id}/replay`)).status).toBe(409);
    expect((await post(admin.token, `/webhooks/${status.id}/cancel`)).status).toBe(200);
    expect((await post(admin.token, `/webhooks/${status.id}/cancel`)).status).toBe(409);
  });

  it('updates processing settings and applies retention', async () => {
    const admin = await getPlatformAdminToken();
    const noReason = await request(app)
      .patch('/api/v1/admin/operations/settings')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ outboxRetentionDays: 7 });
    expect(noReason.status).toBe(400);

    const updated = await request(app)
      .patch('/api/v1/admin/operations/settings')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ outboxRetentionDays: 7, retryMaxAttempts: 3, reason });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({
      outboxRetentionDays: 7,
      retryMaxAttempts: 3,
    });

    const old = await createOutbox('PROCESSED');
    await prisma.$executeRaw`UPDATE outbox_events SET updated_at = NOW() - INTERVAL '30 days' WHERE id = ${old.id}::uuid`;
    const recent = await createOutbox('PROCESSED');
    const stuck = await createOutbox('DEAD_LETTER');
    await prisma.$executeRaw`UPDATE outbox_events SET updated_at = NOW() - INTERVAL '30 days' WHERE id = ${stuck.id}::uuid`;

    const purge = await post(admin.token, '/operations/purge');
    expect(purge.status).toBe(200);
    expect(purge.body.data.outboxDeleted).toBe(1);
    const remaining = (await prisma.outboxEvent.findMany({ select: { id: true } })).map(
      (row) => row.id,
    );
    expect(remaining).toEqual(expect.arrayContaining([recent.id, stuck.id]));
    expect(remaining).not.toContain(old.id);
  });

  it('reports internal table health and redacted provider status only', async () => {
    const admin = await getPlatformAdminToken();
    const health = await request(app)
      .get('/api/v1/admin/internal-health')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(health.status).toBe(200);
    expect(health.body.data).toHaveProperty('tokens.activeRefreshTokens');
    expect(health.body.data).toHaveProperty('providers.storage.configured');
    const text = JSON.stringify(health.body);
    for (const secret of [
      process.env.JWT_ACCESS_SECRET,
      process.env.SMTP_PASSWORD,
      process.env.ENCRYPTION_KEY,
    ].filter((value): value is string => !!value && value.length >= 12)) {
      expect(text).not.toContain(secret);
    }

    const providers = await request(app)
      .get('/api/v1/admin/providers?check=true')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(providers.status).toBe(200);
    expect(providers.body.data.storage.health).toBe('ok');
  });

  it('is closed to tenant users', async () => {
    const manager = await getAuthToken(app);
    const event = await createOutbox('DEAD_LETTER');
    expect((await post(manager.token, `/outbox/${event.id}/retry`)).status).toBe(403);
    const settings = await request(app)
      .get('/api/v1/admin/operations/settings')
      .set('Authorization', `Bearer ${manager.token}`);
    expect(settings.status).toBe(403);
  });
});
