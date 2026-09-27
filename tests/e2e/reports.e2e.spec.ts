import crypto from 'crypto';

import type { Application } from 'express';
import request from 'supertest';

import type { ReportService } from '../../src/application/report/services/report.service';
import { getAuthToken, getTestApp } from '../helpers/test-app';
import { cleanupTestDatabase, getTestPrisma } from '../helpers/test-db';

describe('Reports E2E', () => {
  let app: Application;
  let reports: ReportService;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    const test = await getTestApp();
    app = test.app;
    reports = test.container.resolve('reportService');
  });
  beforeEach(async () => {
    await cleanupTestDatabase();
  });

  async function seedTickets(tenantId: string, createdById: string, agentId?: string) {
    const customer = await prisma.customer.create({
      data: { tenantId, fullName: 'Buyer', email: `b-${crypto.randomUUID()}@test.com` },
    });
    const statuses = ['OPEN', 'OPEN', 'RESOLVED'] as const;
    for (const [index, status] of statuses.entries()) {
      await prisma.ticket.create({
        data: {
          tenantId,
          customerId: customer.id,
          createdById,
          assignedAgentId: index === 0 ? agentId : null,
          ticketNumber: index + 1,
          title: `Ticket ${index + 1}`,
          description: 'Report fixture ticket',
          status,
        },
      });
    }
  }

  const generate = (token: string, body: object) =>
    request(app)
      .post('/api/v1/reports/generate')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  it('produces a filtered CSV export that only its requester can download', async () => {
    const manager = await getAuthToken(app);
    await seedTickets(manager.tenantId, manager.userId);

    const created = await generate(manager.token, {
      subject: 'tickets',
      kind: 'export',
      format: 'csv',
      filters: { status: 'OPEN' },
    });
    expect(created.status).toBe(202);
    expect(created.body.data.status).toBe('PENDING');
    const id = created.body.data.id as string;

    const early = await request(app)
      .get(`/api/v1/reports/${id}/download-url`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(early.status).toBe(409);

    await reports.processPending();

    const status = await request(app)
      .get(`/api/v1/reports/${id}`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(status.body.data).toMatchObject({ status: 'COMPLETED', rowCount: 2 });

    const download = await request(app)
      .get(`/api/v1/reports/${id}/download-url`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(download.status).toBe(200);
    expect(download.body.data.expiresInSeconds).toBe(600);

    // Another manager of the same organization and another organization cannot see it.
    const colleague = await getAuthToken(app, 'TENANT_MANAGER', manager.tenantId);
    const outsider = await getAuthToken(app);
    for (const token of [colleague.token, outsider.token]) {
      const denied = await request(app)
        .get(`/api/v1/reports/${id}/download-url`)
        .set('Authorization', `Bearer ${token}`);
      expect(denied.status).toBe(404);
    }

    const audits = await prisma.auditLog.findMany({
      where: { resource: 'reports', resourceId: id },
    });
    expect(audits.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(audits)).not.toContain('Ticket 1');
  });

  it('builds JSON summaries and scopes agents to assigned tickets', async () => {
    const manager = await getAuthToken(app);
    const agent = await getAuthToken(app, 'AGENT', manager.tenantId);
    await seedTickets(manager.tenantId, manager.userId, agent.userId);

    const created = await generate(agent.token, {
      subject: 'tickets',
      kind: 'summary',
      format: 'json',
    });
    expect(created.status).toBe(202);
    await reports.processPending();
    const job = await prisma.reportJob.findUniqueOrThrow({
      where: { id: created.body.data.id },
    });
    expect(job).toMatchObject({ status: 'COMPLETED', rowCount: 1 });

    const csvSummary = await generate(manager.token, {
      subject: 'tickets',
      kind: 'summary',
      format: 'csv',
    });
    expect(csvSummary.status).toBe(400);
  });

  it('keeps customer exports behind customer access', async () => {
    const manager = await getAuthToken(app);
    const customer = await getAuthToken(app, 'CUSTOMER', manager.tenantId);
    const denied = await generate(customer.token, {
      subject: 'customers',
      kind: 'export',
      format: 'csv',
    });
    expect(denied.status).toBe(403);
  });

  it('cancels pending reports and expires finished files', async () => {
    const manager = await getAuthToken(app);
    const created = await generate(manager.token, {
      subject: 'customers',
      kind: 'export',
      format: 'json',
    });
    const id = created.body.data.id as string;
    const cancel = await request(app)
      .post(`/api/v1/reports/${id}/cancel`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(cancel.status).toBe(204);
    await reports.processPending();
    expect((await prisma.reportJob.findUniqueOrThrow({ where: { id } })).status).toBe(
      'CANCELLED',
    );
    const again = await request(app)
      .post(`/api/v1/reports/${id}/cancel`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(again.status).toBe(409);

    const finished = await generate(manager.token, {
      subject: 'customers',
      kind: 'export',
      format: 'json',
    });
    await reports.processPending();
    await prisma.reportJob.update({
      where: { id: finished.body.data.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await reports.processPending();
    const expired = await prisma.reportJob.findUniqueOrThrow({
      where: { id: finished.body.data.id },
    });
    expect(expired).toMatchObject({ status: 'EXPIRED', storagePath: null });
    const download = await request(app)
      .get(`/api/v1/reports/${finished.body.data.id}/download-url`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(download.status).toBe(409);
  });

  it('lists only the requester reports with a status filter', async () => {
    const manager = await getAuthToken(app);
    const colleague = await getAuthToken(app, 'TENANT_MANAGER', manager.tenantId);
    await generate(manager.token, {
      subject: 'customers',
      kind: 'export',
      format: 'csv',
    });
    await generate(colleague.token, {
      subject: 'customers',
      kind: 'export',
      format: 'csv',
    });
    const list = await request(app)
      .get('/api/v1/reports?status=PENDING')
      .set('Authorization', `Bearer ${manager.token}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
  });
});
