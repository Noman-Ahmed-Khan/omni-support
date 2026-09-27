import type { PrismaClient } from '@prisma/client';
import { mockDeep } from 'jest-mock-extended';

import type { PermissionService } from '../../../../src/application/auth/services/permission.service';
import { ReportService } from '../../../../src/application/report/services/report.service';
import type { AuditRepository } from '../../../../src/infrastructure/database/repositories/audit.repository';
import type { IStorageProvider } from '../../../../src/infrastructure/storage/storage-provider.interface';
import { ForbiddenError } from '../../../../src/shared/errors/application.error';
import { ConflictError, NotFoundError } from '../../../../src/shared/errors/domain.error';

function ticketRow(n: number) {
  return {
    id: `t-${String(n).padStart(6, '0')}`,
    ticketNumber: n,
    title: n === 1 ? '=HYPERLINK("bad")' : `Ticket ${n}`,
    status: 'OPEN',
    priority: 'HIGH',
    category: 'GENERAL',
    isEscalated: false,
    createdAt: new Date('2026-01-01'),
    resolvedAt: null,
    customerId: 'customer',
    assignedAgentId: 'agent',
  };
}

describe('ReportService', () => {
  const prisma = mockDeep<PrismaClient>();
  const storage = mockDeep<IStorageProvider>();
  const audit = mockDeep<AuditRepository>();
  const permissions = mockDeep<PermissionService>();
  const service = new ReportService(prisma, storage, audit, permissions);

  const job = {
    id: 'report',
    tenantId: 'tenant',
    requestedById: 'agent',
    subject: 'tickets',
    kind: 'export',
    format: 'csv',
    filters: {},
    status: 'PENDING',
  } as never;

  beforeEach(() => {
    jest.resetAllMocks();
    permissions.assert.mockResolvedValue(undefined);
    prisma.reportJob.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([job]);
    prisma.reportJob.deleteMany.mockResolvedValue({ count: 0 });
    prisma.reportJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findFirst.mockResolvedValue({
      id: 'agent',
      role: 'AGENT',
      tenantId: 'tenant',
    } as never);
    storage.upload.mockResolvedValue({ storagePath: 'reports/file', provider: 'memory' });
  });

  it('requires tenant and requester ownership for downloads', async () => {
    prisma.reportJob.findFirst.mockResolvedValue(null);
    await expect(
      service.getDownloadUrl('report', 'tenant', { id: 'user', role: 'AGENT' }),
    ).rejects.toThrow(NotFoundError);
    expect(prisma.reportJob.findFirst).toHaveBeenCalledWith({
      where: { id: 'report', tenantId: 'tenant', requestedById: 'user' },
    });
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
  });

  it('refuses downloads once the requester loses the permission', async () => {
    prisma.reportJob.findFirst.mockResolvedValue({
      ...(job as object),
      status: 'COMPLETED',
      storagePath: 'reports/file',
      expiresAt: new Date(Date.now() + 60_000),
    } as never);
    permissions.assert.mockRejectedValue(new ForbiddenError('no'));
    await expect(
      service.getDownloadUrl('report', 'tenant', { id: 'agent', role: 'AGENT' }),
    ).rejects.toThrow(ForbiddenError);
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
  });

  it('issues a short-lived URL for a completed report and audits it', async () => {
    prisma.reportJob.findFirst.mockResolvedValue({
      ...(job as object),
      status: 'COMPLETED',
      storagePath: 'reports/file',
      expiresAt: new Date(Date.now() + 60_000),
    } as never);
    storage.getSignedUrl.mockResolvedValue('https://signed');
    await expect(
      service.getDownloadUrl('report', 'tenant', { id: 'agent', role: 'AGENT' }),
    ).resolves.toEqual({ url: 'https://signed', expiresInSeconds: 600 });
    expect(storage.getSignedUrl).toHaveBeenCalledWith('reports/file', { expiresIn: 600 });
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EXPORT', resourceId: 'report' }),
    );
  });

  it('refuses downloads of expired reports', async () => {
    prisma.reportJob.findFirst.mockResolvedValue({
      ...(job as object),
      status: 'COMPLETED',
      storagePath: 'reports/file',
      expiresAt: new Date(Date.now() - 1),
    } as never);
    await expect(
      service.getDownloadUrl('report', 'tenant', { id: 'agent', role: 'AGENT' }),
    ).rejects.toThrow(ConflictError);
  });

  it('limits an agent export to their assigned tickets and escapes CSV formulas', async () => {
    prisma.ticket.findMany.mockResolvedValueOnce([ticketRow(1)] as never);
    prisma.reportJob.findUnique.mockImplementation(
      () =>
        Promise.resolve({
          status: 'RUNNING',
          startedAt: prisma.reportJob.updateMany.mock.calls[0][0].data.startedAt,
        }) as never,
    );

    await service.processPending();

    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant', assignedAgentId: 'agent' }),
      }),
    );
    const buffer = storage.upload.mock.calls[0][0];
    expect(buffer.toString()).toContain("'=HYPERLINK");
    expect(prisma.reportJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'RUNNING' }),
        data: expect.objectContaining({ status: 'COMPLETED', rowCount: 1 }),
      }),
    );
    // Audit carries metadata only, never report contents.
    const auditEntry = audit.create.mock.calls[0][0];
    expect(JSON.stringify(auditEntry)).not.toContain('HYPERLINK');
  });

  it('pages through large exports in batches', async () => {
    const rows = Array.from({ length: 2500 }, (_, index) => ticketRow(index + 1));
    prisma.ticket.findMany
      .mockResolvedValueOnce(rows.slice(0, 1000) as never)
      .mockResolvedValueOnce(rows.slice(1000, 2000) as never)
      .mockResolvedValueOnce(rows.slice(2000) as never);
    prisma.reportJob.findUnique.mockImplementation(
      () =>
        Promise.resolve({
          status: 'RUNNING',
          startedAt: prisma.reportJob.updateMany.mock.calls[0][0].data.startedAt,
        }) as never,
    );

    await service.processPending();

    expect(prisma.ticket.findMany).toHaveBeenCalledTimes(3);
    expect(prisma.ticket.findMany.mock.calls[1][0]).toMatchObject({
      cursor: { id: rows[999].id },
      skip: 1,
    });
    const csv = storage.upload.mock.calls[0][0].toString();
    expect(csv.split('\r\n')).toHaveLength(2501);
  });

  it('stops a running report that was cancelled and keeps no file', async () => {
    prisma.ticket.findMany.mockResolvedValueOnce([ticketRow(1)] as never);
    prisma.reportJob.findUnique.mockResolvedValue({
      status: 'CANCELLED',
      startedAt: new Date(),
    } as never);

    await service.processPending();

    expect(storage.upload).not.toHaveBeenCalled();
    expect(prisma.reportJob.updateMany).toHaveBeenCalledTimes(1); // the claim only
  });

  it('deletes the uploaded file if the job was cancelled during upload', async () => {
    prisma.ticket.findMany.mockResolvedValueOnce([ticketRow(1)] as never);
    prisma.reportJob.findUnique.mockImplementation(
      () =>
        Promise.resolve({
          status: 'RUNNING',
          startedAt: prisma.reportJob.updateMany.mock.calls[0][0].data.startedAt,
        }) as never,
    );
    prisma.reportJob.updateMany
      .mockResolvedValueOnce({ count: 1 }) // claim
      .mockResolvedValueOnce({ count: 0 }); // completion lost to a cancel

    await service.processPending();

    expect(storage.delete).toHaveBeenCalledWith('reports/file');
    expect(audit.create).not.toHaveBeenCalled();
  });

  it('skips a job another worker already claimed', async () => {
    prisma.reportJob.updateMany.mockResolvedValue({ count: 0 });
    await service.processPending();
    expect(prisma.ticket.findMany).not.toHaveBeenCalled();
  });

  it('fails the job when the requester lost report permission', async () => {
    permissions.assert.mockRejectedValue(new ForbiddenError('Missing permission'));
    await service.processPending();
    expect(prisma.reportJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  it('only cancels pending or running reports', async () => {
    prisma.reportJob.findMany.mockReset();
    prisma.reportJob.updateMany.mockResolvedValue({ count: 0 });
    prisma.reportJob.findFirst.mockResolvedValue(job);
    await expect(service.cancel('report', 'tenant', 'agent')).rejects.toThrow(
      ConflictError,
    );
  });
});
