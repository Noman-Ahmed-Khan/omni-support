import type { Prisma, PrismaClient, ReportJob } from '@prisma/client';

import type { Permission } from '../../../domain/policies/permission.catalog';
import type { AuditRepository } from '../../../infrastructure/database/repositories/audit.repository';
import type { IStorageProvider } from '../../../infrastructure/storage/storage-provider.interface';
import { ForbiddenError } from '../../../shared/errors/application.error';
import { ConflictError, NotFoundError } from '../../../shared/errors/domain.error';
import { logger } from '../../../shared/utils/logger.util';
import type { PermissionService } from '../../auth/services/permission.service';

export interface ReportFilters {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export type ReportSubject = 'tickets' | 'customers';

/** PENDING -> RUNNING -> COMPLETED -> EXPIRED; FAILED and CANCELLED are terminal. */
export type ReportStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED';

const REPORT_LIFETIME_MS = 24 * 60 * 60 * 1000;
/** Job records (not files) are kept this long after they stop being downloadable. */
const RECORD_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const STALE_RUN_MS = 15 * 60 * 1000;
const DOWNLOAD_URL_TTL_SECONDS = 600;
const BATCH_SIZE = 1_000;
export const MAX_REPORT_ROWS = 200_000;

const SUBJECT_PERMISSIONS: Record<ReportSubject, Permission[]> = {
  tickets: ['reports:create'],
  customers: ['reports:create', 'customers:read'],
};

class ReportCancelledError extends Error {}

export class ReportService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: IStorageProvider,
    private readonly audit: AuditRepository,
    private readonly permissions: PermissionService,
  ) {}

  async create(input: {
    tenantId: string;
    requesterId: string;
    requesterRole: string;
    subject: ReportSubject;
    kind: 'export' | 'summary';
    format: 'csv' | 'json';
    filters: ReportFilters;
  }): Promise<ReportJob> {
    await this.assertAllowed(
      { id: input.requesterId, role: input.requesterRole, tenantId: input.tenantId },
      input.subject,
    );
    return this.prisma.reportJob.create({
      data: {
        tenantId: input.tenantId,
        requestedById: input.requesterId,
        subject: input.subject,
        kind: input.kind,
        format: input.format,
        filters: { ...input.filters },
      },
    });
  }

  list(
    tenantId: string,
    requesterId: string,
    status?: ReportStatus,
  ): Promise<ReportJob[]> {
    return this.prisma.reportJob.findMany({
      where: { tenantId, requestedById: requesterId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async get(id: string, tenantId: string, requesterId: string): Promise<ReportJob> {
    const job = await this.prisma.reportJob.findFirst({
      where: { id, tenantId, requestedById: requesterId },
    });
    if (!job) throw new NotFoundError('Report', id);
    return job;
  }

  /** Pending jobs are cancelled at once; running jobs stop at their next batch. */
  async cancel(id: string, tenantId: string, requesterId: string): Promise<void> {
    const claimed = await this.prisma.reportJob.updateMany({
      where: {
        id,
        tenantId,
        requestedById: requesterId,
        status: { in: ['PENDING', 'RUNNING'] },
      },
      data: { status: 'CANCELLED' },
    });
    if (claimed.count !== 1) {
      await this.get(id, tenantId, requesterId);
      throw new ConflictError('Only pending or running reports can be cancelled');
    }
  }

  async getDownloadUrl(
    id: string,
    tenantId: string,
    requester: { id: string; role: string },
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const job = await this.get(id, tenantId, requester.id);
    if (
      job.status !== 'COMPLETED' ||
      !job.storagePath ||
      !job.expiresAt ||
      job.expiresAt <= new Date()
    ) {
      throw new ConflictError('Report is not available for download');
    }
    // Permissions may have been withdrawn since the report was requested.
    await this.assertAllowed(
      { id: requester.id, role: requester.role, tenantId },
      job.subject as ReportSubject,
    );
    const url = await this.storage.getSignedUrl(job.storagePath, {
      expiresIn: DOWNLOAD_URL_TTL_SECONDS,
    });
    await this.audit.create({
      tenantId,
      actorId: requester.id,
      actorRole: requester.role,
      action: 'EXPORT',
      resource: 'reports',
      resourceId: job.id,
      metadata: { event: 'DOWNLOAD_URL_ISSUED', subject: job.subject },
    });
    return { url, expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS };
  }

  async processPending(): Promise<void> {
    await this.expireFiles();
    await this.purgeRecords();
    const staleBefore = new Date(Date.now() - STALE_RUN_MS);
    const claimable: Prisma.ReportJobWhereInput = {
      OR: [{ status: 'PENDING' }, { status: 'RUNNING', startedAt: { lt: staleBefore } }],
    };
    const pending = await this.prisma.reportJob.findMany({
      where: claimable,
      orderBy: { createdAt: 'asc' },
      take: 5,
    });
    for (const job of pending) {
      const startedAt = new Date();
      // Conditional claim: concurrent workers cannot both run the same job.
      const claimed = await this.prisma.reportJob.updateMany({
        where: { id: job.id, ...claimable },
        data: { status: 'RUNNING', startedAt },
      });
      if (claimed.count !== 1) continue;
      try {
        await this.process({ ...job, startedAt });
      } catch (error) {
        if (error instanceof ReportCancelledError) {
          logger.info('Report cancelled while running', { reportId: job.id });
          continue;
        }
        logger.error('Report generation failed', { reportId: job.id, error });
        await this.prisma.reportJob.updateMany({
          where: { id: job.id, status: 'RUNNING', startedAt },
          data: {
            status: 'FAILED',
            error:
              error instanceof ConflictError || error instanceof ForbiddenError
                ? error.message
                : 'Report generation failed',
          },
        });
      }
    }
  }

  private async process(job: ReportJob & { startedAt: Date }): Promise<void> {
    const requester = await this.prisma.user.findFirst({
      where: { id: job.requestedById, tenantId: job.tenantId, status: 'ACTIVE' },
      select: { id: true, role: true, tenantId: true },
    });
    if (!requester) throw new ForbiddenError('Requester is no longer authorized');
    await this.assertAllowed(requester, job.subject as ReportSubject);

    const filters = job.filters as ReportFilters;
    const records: Array<Record<string, unknown>> = [];
    for await (const batch of this.readBatches(job, requester.role, filters)) {
      records.push(...batch);
      if (records.length > MAX_REPORT_ROWS) {
        throw new ConflictError(
          `Report exceeds ${MAX_REPORT_ROWS} rows; narrow the filters`,
        );
      }
      await this.assertStillRunning(job);
    }

    const isJson = job.kind === 'summary' || job.format === 'json';
    const content =
      job.kind === 'summary'
        ? JSON.stringify({
            subject: job.subject,
            filters,
            total: records.length,
            byStatus: countBy(records, 'status'),
            ...(job.subject === 'tickets'
              ? {
                  byPriority: countBy(records, 'priority'),
                  byCategory: countBy(records, 'category'),
                }
              : { byRisk: countBy(records, 'riskLabel') }),
          })
        : isJson
          ? JSON.stringify(records)
          : toCsv(records);
    const mimeType = isJson ? 'application/json' : 'text/csv';
    const buffer = Buffer.from(content, 'utf8');
    const uploaded = await this.storage.upload(buffer, {
      filename: `report-${job.id}.${isJson ? 'json' : 'csv'}`,
      mimeType,
      sizeBytes: buffer.length,
      tenantId: job.tenantId,
      folder: 'reports',
    });

    const completed = await this.prisma.reportJob.updateMany({
      where: { id: job.id, status: 'RUNNING', startedAt: job.startedAt },
      data: {
        status: 'COMPLETED',
        storagePath: uploaded.storagePath,
        rowCount: records.length,
        error: null,
        expiresAt: new Date(Date.now() + REPORT_LIFETIME_MS),
      },
    });
    if (completed.count !== 1) {
      // Cancelled (or reclaimed) while uploading: the file must not outlive the job.
      await this.storage.delete(uploaded.storagePath);
      throw new ReportCancelledError();
    }
    // Only metadata is audited, never report contents.
    await this.audit.create({
      tenantId: job.tenantId,
      actorId: job.requestedById,
      action: 'EXPORT',
      resource: 'reports',
      resourceId: job.id,
      metadata: {
        subject: job.subject,
        kind: job.kind,
        format: job.format,
        rowCount: records.length,
      },
    });
  }

  private async *readBatches(
    job: ReportJob,
    requesterRole: string,
    filters: ReportFilters,
  ): AsyncGenerator<Array<Record<string, unknown>>> {
    const createdAt = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
    };
    const hasDates = Object.keys(createdAt).length > 0;
    let cursor: string | undefined;
    for (;;) {
      const page: Array<Record<string, unknown> & { id: string }> =
        job.subject === 'tickets'
          ? await this.prisma.ticket.findMany({
              where: {
                tenantId: job.tenantId,
                // Row-level rule: agents only see tickets assigned to them.
                ...(requesterRole === 'AGENT'
                  ? { assignedAgentId: job.requestedById }
                  : {}),
                ...(filters.status
                  ? { status: filters.status as Prisma.EnumTicketStatusFilter<'Ticket'> }
                  : {}),
                ...(hasDates ? { createdAt } : {}),
              },
              orderBy: { id: 'asc' },
              take: BATCH_SIZE,
              ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
              select: {
                id: true,
                ticketNumber: true,
                title: true,
                status: true,
                priority: true,
                category: true,
                isEscalated: true,
                createdAt: true,
                resolvedAt: true,
                customerId: true,
                assignedAgentId: true,
              },
            })
          : await this.prisma.customer.findMany({
              where: {
                tenantId: job.tenantId,
                ...(filters.status
                  ? {
                      status:
                        filters.status as Prisma.EnumCustomerStatusFilter<'Customer'>,
                    }
                  : {}),
                ...(hasDates ? { createdAt } : {}),
              },
              orderBy: { id: 'asc' },
              take: BATCH_SIZE,
              ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
              select: {
                id: true,
                fullName: true,
                email: true,
                company: true,
                status: true,
                riskLabel: true,
                createdAt: true,
              },
            });
      if (page.length === 0) return;
      yield page;
      if (page.length < BATCH_SIZE) return;
      cursor = page[page.length - 1].id;
    }
  }

  private async assertStillRunning(job: ReportJob & { startedAt: Date }): Promise<void> {
    const current = await this.prisma.reportJob.findUnique({
      where: { id: job.id },
      select: { status: true, startedAt: true },
    });
    if (
      !current ||
      current.status !== 'RUNNING' ||
      current.startedAt?.getTime() !== job.startedAt.getTime()
    ) {
      throw new ReportCancelledError();
    }
  }

  private async assertAllowed(
    subject: { id: string; role: string; tenantId: string | null },
    reportSubject: ReportSubject,
  ): Promise<void> {
    for (const permission of SUBJECT_PERMISSIONS[reportSubject]) {
      await this.permissions.assert(subject, permission);
    }
  }

  private async expireFiles(): Promise<void> {
    const expired = await this.prisma.reportJob.findMany({
      where: { status: 'COMPLETED', expiresAt: { lte: new Date() } },
      take: 50,
    });
    for (const job of expired) {
      if (job.storagePath) await this.storage.delete(job.storagePath);
      await this.prisma.reportJob.updateMany({
        where: { id: job.id, status: 'COMPLETED' },
        data: { status: 'EXPIRED', storagePath: null },
      });
    }
  }

  private async purgeRecords(): Promise<void> {
    await this.prisma.reportJob.deleteMany({
      where: {
        status: { in: ['EXPIRED', 'FAILED', 'CANCELLED'] },
        updatedAt: { lt: new Date(Date.now() - RECORD_RETENTION_MS) },
      },
    });
  }
}

function countBy(
  records: Array<Record<string, unknown>>,
  field: string,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const record of records) {
    const key = String(record[field] ?? 'NONE');
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function toCsv(records: Array<Record<string, unknown>>): string {
  if (!records.length) return '';
  const fields = Object.keys(records[0]).filter((field) => field !== 'id');
  const quote = (value: unknown): string => {
    const text = value instanceof Date ? value.toISOString() : String(value ?? '');
    // Leading formula characters are neutralised so spreadsheets do not execute them.
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return [
    fields.join(','),
    ...records.map((row) => fields.map((key) => quote(row[key])).join(',')),
  ].join('\r\n');
}
