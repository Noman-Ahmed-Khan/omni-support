import { randomUUID } from 'crypto';

import { Prisma, type PrismaClient } from '@prisma/client';

import type {
  OperationalSettings,
  OperationalSettingsService,
} from './operational-settings.service';
import type { AuditRepository } from '../../../infrastructure/database/repositories/audit.repository';
import { OutboxStatus } from '../../../infrastructure/outbox/outbox.entity';
import { ConflictError, NotFoundError } from '../../../shared/errors/domain.error';
import { redactSensitive } from '../../../shared/utils/redact.util';
import {
  RETRYABLE_WEBHOOK_STATUSES,
  WebhookStatus,
  type WebhookProcessingService,
} from '../../messaging/services/webhook-processing.service';

export interface OperatorActor {
  id: string;
  role: string;
}

export interface RecordFilter {
  status?: string;
  eventType?: string;
  tenantId?: string;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

type Target = 'outbox' | 'webhook' | 'settings';
type Action = 'RETRY' | 'REPLAY' | 'CANCEL' | 'CONFIGURE' | 'PURGE';

/** Outbox rows an operator may retry (terminal failures and scheduled retries). */
const OUTBOX_RETRYABLE = [OutboxStatus.FAILED, OutboxStatus.DEAD_LETTER];
/** Outbox rows an operator may cancel. PROCESSING rows belong to a worker. */
const OUTBOX_CANCELLABLE = [
  OutboxStatus.PENDING,
  OutboxStatus.FAILED,
  OutboxStatus.DEAD_LETTER,
];
/** Outbox rows that may be replayed as a new, separately identified event. */
const OUTBOX_REPLAYABLE = [
  OutboxStatus.PROCESSED,
  OutboxStatus.DEAD_LETTER,
  OutboxStatus.CANCELLED,
];
const WEBHOOK_REPLAYABLE = [
  WebhookStatus.PROCESSED,
  WebhookStatus.SKIPPED,
  WebhookStatus.CANCELLED,
];

const outboxSelect = {
  id: true,
  tenantId: true,
  aggregateType: true,
  aggregateId: true,
  eventType: true,
  eventId: true,
  status: true,
  attempts: true,
  maxAttempts: true,
  availableAt: true,
  lockedAt: true,
  processedAt: true,
  failedAt: true,
  deadLetterReason: true,
  replayOfId: true,
  occurredAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const webhookSelect = {
  id: true,
  tenantId: true,
  eventType: true,
  provider: true,
  status: true,
  processed: true,
  processedAt: true,
  error: true,
  retryCount: true,
  lockedAt: true,
  replayOfId: true,
  createdAt: true,
} as const;

function dateRange(filter: RecordFilter): { gte?: Date; lte?: Date } | undefined {
  if (!filter.from && !filter.to) return undefined;
  return {
    ...(filter.from ? { gte: filter.from } : {}),
    ...(filter.to ? { lte: filter.to } : {}),
  };
}

function page<T>(rows: T[], total: number, filter: RecordFilter) {
  return {
    rows,
    meta: {
      total,
      page: filter.page,
      limit: filter.limit,
      totalPages: Math.ceil(total / filter.limit),
    },
  };
}

/**
 * Platform-admin controls over webhook and outbox records. Stored payloads are never
 * modified: a retry re-runs the same row, a replay inserts a new row that references
 * the original. Every intervention needs a reason and is recorded both as an
 * operational intervention and in the audit log. Responses redact secrets and
 * personal data.
 */
export class PlatformOperationsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly settings: OperationalSettingsService,
    private readonly webhooks: WebhookProcessingService,
    private readonly auditRepo: AuditRepository,
  ) {}

  async listOutbox(filter: RecordFilter) {
    const where: Prisma.OutboxEventWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.eventType ? { eventType: filter.eventType } : {}),
      ...(filter.tenantId ? { tenantId: filter.tenantId } : {}),
      ...(dateRange(filter) ? { createdAt: dateRange(filter) } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.outboxEvent.findMany({
        where,
        select: outboxSelect,
        orderBy: { createdAt: 'desc' },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
      }),
      this.prisma.outboxEvent.count({ where }),
    ]);
    return page(rows, total, filter);
  }

  async getOutbox(id: string) {
    const row = await this.prisma.outboxEvent.findUnique({
      where: { id },
      select: { ...outboxSelect, payload: true },
    });
    if (!row) throw new NotFoundError('Outbox event', id);
    const [replays, interventions] = await Promise.all([
      this.prisma.outboxEvent.findMany({
        where: { replayOfId: id },
        select: { id: true, status: true, createdAt: true },
      }),
      this.listInterventions('outbox', id),
    ]);
    return { ...row, payload: redactSensitive(row.payload), replays, interventions };
  }

  async retryOutbox(id: string, actor: OperatorActor, reason: string) {
    const settings = await this.settings.get();
    const row = await this.findOutbox(id);
    const updated = await this.prisma.outboxEvent.updateMany({
      where: { id, status: { in: OUTBOX_RETRYABLE } },
      data: {
        status: OutboxStatus.PENDING,
        availableAt: new Date(),
        maxAttempts: row.attempts + settings.retryMaxAttempts,
        deadLetterReason: null,
        failedAt: null,
      },
    });
    if (updated.count !== 1) {
      throw new ConflictError(`Outbox events in status ${row.status} cannot be retried`);
    }
    return this.record('outbox', id, 'RETRY', actor, reason, { outcome: 'ACCEPTED' });
  }

  async cancelOutbox(id: string, actor: OperatorActor, reason: string) {
    const row = await this.findOutbox(id);
    const updated = await this.prisma.outboxEvent.updateMany({
      where: { id, status: { in: OUTBOX_CANCELLABLE } },
      data: { status: OutboxStatus.CANCELLED, lockedAt: null, lockedBy: null },
    });
    if (updated.count !== 1) {
      throw new ConflictError(
        `Outbox events in status ${row.status} cannot be cancelled`,
      );
    }
    return this.record('outbox', id, 'CANCEL', actor, reason, { outcome: 'SUCCEEDED' });
  }

  async replayOutbox(id: string, actor: OperatorActor, reason: string) {
    const original = await this.prisma.outboxEvent.findUnique({ where: { id } });
    if (!original) throw new NotFoundError('Outbox event', id);
    if (!(OUTBOX_REPLAYABLE as string[]).includes(original.status)) {
      throw new ConflictError(
        `Outbox events in status ${original.status} cannot be replayed`,
      );
    }
    const settings = await this.settings.get();
    const replayId = randomUUID();
    try {
      await this.prisma.outboxEvent.create({
        data: {
          id: replayId,
          // A new event id: handler idempotency ledgers treat the replay as new work.
          eventId: randomUUID(),
          replayOfId: original.id,
          tenantId: original.tenantId,
          aggregateType: original.aggregateType,
          aggregateId: original.aggregateId,
          eventType: original.eventType,
          occurredAt: original.occurredAt,
          payload: original.payload as Prisma.InputJsonValue,
          status: OutboxStatus.PENDING,
          maxAttempts: settings.retryMaxAttempts,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictError('A replay of this event is still in progress');
      }
      throw error;
    }
    return this.record('outbox', id, 'REPLAY', actor, reason, {
      outcome: 'ACCEPTED',
      resultId: replayId,
    });
  }

  async listWebhooks(filter: RecordFilter) {
    const where: Prisma.WebhookEventWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.eventType
        ? { eventType: filter.eventType as Prisma.EnumWebhookEventTypeFilter['equals'] }
        : {}),
      ...(filter.tenantId ? { tenantId: filter.tenantId } : {}),
      ...(dateRange(filter) ? { createdAt: dateRange(filter) } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.webhookEvent.findMany({
        where,
        select: webhookSelect,
        orderBy: { createdAt: 'desc' },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
      }),
      this.prisma.webhookEvent.count({ where }),
    ]);
    return page(rows, total, filter);
  }

  async getWebhook(id: string) {
    const row = await this.prisma.webhookEvent.findUnique({
      where: { id },
      select: { ...webhookSelect, payload: true },
    });
    if (!row) throw new NotFoundError('Webhook event', id);
    const [replays, interventions] = await Promise.all([
      this.prisma.webhookEvent.findMany({
        where: { replayOfId: id },
        select: { id: true, status: true, createdAt: true },
      }),
      this.listInterventions('webhook', id),
    ]);
    return { ...row, payload: redactSensitive(row.payload), replays, interventions };
  }

  async retryWebhook(id: string, actor: OperatorActor, reason: string) {
    const row = await this.findWebhook(id);
    const result = await this.webhooks.process(id);
    if (result.status === 'NOT_CLAIMED') {
      throw new ConflictError(
        `Webhook events in status ${row.status} cannot be retried (or are being processed)`,
      );
    }
    return this.record('webhook', id, 'RETRY', actor, reason, {
      outcome: result.status === 'PROCESSED' ? 'SUCCEEDED' : 'FAILED',
      error: result.detail,
    });
  }

  async replayWebhook(id: string, actor: OperatorActor, reason: string) {
    const original = await this.prisma.webhookEvent.findUnique({ where: { id } });
    if (!original) throw new NotFoundError('Webhook event', id);
    if (original.eventType !== 'WHATSAPP_INBOUND') {
      throw new ConflictError('Only inbound message events can be replayed');
    }
    if (!WEBHOOK_REPLAYABLE.includes(original.status as never)) {
      throw new ConflictError(
        `Webhook events in status ${original.status} cannot be replayed`,
      );
    }
    const replayId = randomUUID();
    try {
      await this.prisma.webhookEvent.create({
        data: {
          id: replayId,
          replayOfId: original.id,
          tenantId: original.tenantId,
          eventType: original.eventType,
          provider: original.provider,
          payload: original.payload as Prisma.InputJsonValue,
          signature: original.signature,
          status: WebhookStatus.RECEIVED,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictError('A replay of this event is still in progress');
      }
      throw error;
    }
    const result = await this.webhooks.process(replayId);
    return this.record('webhook', id, 'REPLAY', actor, reason, {
      outcome: result.status === 'PROCESSED' ? 'SUCCEEDED' : 'FAILED',
      resultId: replayId,
      error:
        result.status === 'NOT_CLAIMED' ? 'Replay was claimed elsewhere' : result.detail,
    });
  }

  async cancelWebhook(id: string, actor: OperatorActor, reason: string) {
    const row = await this.findWebhook(id);
    const updated = await this.prisma.webhookEvent.updateMany({
      where: { id, status: { in: RETRYABLE_WEBHOOK_STATUSES } },
      data: { status: WebhookStatus.CANCELLED },
    });
    if (updated.count !== 1) {
      throw new ConflictError(
        `Webhook events in status ${row.status} cannot be cancelled`,
      );
    }
    return this.record('webhook', id, 'CANCEL', actor, reason, { outcome: 'SUCCEEDED' });
  }

  getSettings(): Promise<OperationalSettings> {
    return this.settings.get();
  }

  async updateSettings(
    changes: Partial<OperationalSettings>,
    actor: OperatorActor,
    reason: string,
  ): Promise<OperationalSettings> {
    const { before, after } = await this.settings.update(changes, actor.id);
    await this.record('settings', null, 'CONFIGURE', actor, reason, {
      outcome: 'SUCCEEDED',
      detail: { before, after },
    });
    return after;
  }

  /** Deletes finished records older than the configured retention. Interventions are kept. */
  async purge(actor?: OperatorActor, reason?: string) {
    const settings = await this.settings.get();
    const day = 24 * 60 * 60 * 1000;
    const [outbox, webhooks] = await Promise.all([
      this.prisma.outboxEvent.deleteMany({
        where: {
          status: { in: [OutboxStatus.PROCESSED, OutboxStatus.CANCELLED] },
          updatedAt: { lt: new Date(Date.now() - settings.outboxRetentionDays * day) },
        },
      }),
      this.prisma.webhookEvent.deleteMany({
        where: {
          status: {
            in: [WebhookStatus.PROCESSED, WebhookStatus.SKIPPED, WebhookStatus.CANCELLED],
          },
          createdAt: { lt: new Date(Date.now() - settings.webhookRetentionDays * day) },
        },
      }),
    ]);
    const result = { outboxDeleted: outbox.count, webhooksDeleted: webhooks.count };
    if (actor && reason) {
      await this.record('settings', null, 'PURGE', actor, reason, {
        outcome: 'SUCCEEDED',
        detail: result,
      });
    }
    return result;
  }

  listInterventions(targetType?: Target, targetId?: string) {
    return this.prisma.operationalIntervention.findMany({
      where: {
        ...(targetType ? { targetType } : {}),
        ...(targetId ? { targetId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  private async findOutbox(id: string) {
    const row = await this.prisma.outboxEvent.findUnique({
      where: { id },
      select: { id: true, status: true, attempts: true },
    });
    if (!row) throw new NotFoundError('Outbox event', id);
    return row;
  }

  private async findWebhook(id: string) {
    const row = await this.prisma.webhookEvent.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!row) throw new NotFoundError('Webhook event', id);
    return row;
  }

  private async record(
    targetType: Target,
    targetId: string | null,
    action: Action,
    actor: OperatorActor,
    reason: string,
    result: {
      outcome: 'ACCEPTED' | 'SUCCEEDED' | 'FAILED';
      resultId?: string;
      error?: string;
      detail?: Record<string, unknown>;
    },
  ) {
    const intervention = await this.prisma.operationalIntervention.create({
      data: {
        targetType,
        targetId,
        action,
        reason,
        actorId: actor.id,
        resultId: result.resultId,
        outcome: result.outcome,
        error: result.error?.slice(0, 2000),
      },
    });
    await this.auditRepo.create({
      actorId: actor.id,
      actorRole: actor.role,
      action: action === 'CANCEL' ? 'DELETE' : 'UPDATE',
      resource: `operations.${targetType}`,
      resourceId: targetId ?? undefined,
      metadata: {
        intervention: intervention.id,
        action,
        reason,
        outcome: result.outcome,
        resultId: result.resultId,
        ...(result.detail ? { detail: result.detail } : {}),
      },
    });
    return intervention;
  }
}
