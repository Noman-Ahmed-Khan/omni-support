import type { Prisma, PrismaClient } from '@prisma/client';

import type { OutboxPayload, OutboxRecord } from './outbox.entity';
import { OutboxStatus } from './outbox.entity';
import type { BaseDomainEvent } from '../../domain/shared/base.event';
import { createId } from '../../shared/utils/id.util';
import {
  resolveDatabaseClient,
  type DatabaseClient,
} from '../database/transaction-context';

export const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BATCH_SIZE = 100;
const BASE_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;

type OutboxRow = {
  id: string;
  tenant_id: string | null;
  aggregate_type: string | null;
  aggregate_id: string | null;
  event_type: string;
  event_id: string;
  occurred_at: Date;
  payload: Record<string, unknown>;
  status: OutboxStatus;
  attempts: number;
  max_attempts: number;
  available_at: Date;
  processed_at: Date | null;
  failed_at: Date | null;
  dead_letter_reason: string | null;
  created_at: Date;
  updated_at: Date;
};

/** Exponential backoff for the given (1-based) attempt number. */
export function computeRetryDelayMs(attempts: number): number {
  return Math.min(
    BASE_RETRY_DELAY_MS * 2 ** Math.max(attempts - 1, 0),
    MAX_RETRY_DELAY_MS,
  );
}

export class OutboxRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Joins the caller's transaction when one is active, so events commit with the aggregate. */
  private get db(): DatabaseClient {
    return resolveDatabaseClient(this.prisma);
  }

  async enqueue(event: BaseDomainEvent): Promise<void> {
    await this.enqueueMany([event]);
  }

  async enqueueMany(events: BaseDomainEvent[]): Promise<void> {
    if (events.length === 0) return;

    await this.db.outboxEvent.createMany({
      data: events.map((event) => this.toCreateInput(event)),
      // event_id is unique: re-publishing the same domain event is a no-op.
      skipDuplicates: true,
    });
  }

  /**
   * Atomically claims up to `batchSize` deliverable events for `workerId`.
   *
   * `FOR UPDATE SKIP LOCKED` guarantees concurrent workers never claim the same row.
   * Rows left in PROCESSING by a crashed worker become claimable again after `leaseMs`.
   */
  async claimBatch(
    workerId: string,
    batchSize = DEFAULT_BATCH_SIZE,
    leaseMs = 5 * 60 * 1000,
  ): Promise<OutboxRecord[]> {
    // Rows whose lease expired too many times are dead-lettered instead of retried forever.
    await this.prisma.$executeRaw`
      UPDATE outbox_events
      SET status = ${OutboxStatus.DEAD_LETTER},
          dead_letter_reason = 'Processing lease expired after maximum attempts',
          locked_at = NULL,
          locked_by = NULL,
          failed_at = NOW(),
          updated_at = NOW()
      WHERE status = ${OutboxStatus.PROCESSING}
        AND locked_at < NOW() - (${leaseMs}::int * INTERVAL '1 millisecond')
        AND attempts >= max_attempts;
    `;

    const rows = await this.prisma.$queryRaw<OutboxRow[]>`
      UPDATE outbox_events
      SET status = ${OutboxStatus.PROCESSING},
          attempts = attempts + 1,
          locked_at = NOW(),
          locked_by = ${workerId},
          updated_at = NOW()
      WHERE id IN (
        SELECT id
        FROM outbox_events
        WHERE (
            status IN (${OutboxStatus.PENDING}, ${OutboxStatus.FAILED})
            AND available_at <= NOW()
          )
          OR (
            status = ${OutboxStatus.PROCESSING}
            AND locked_at < NOW() - (${leaseMs}::int * INTERVAL '1 millisecond')
          )
        ORDER BY occurred_at ASC
        LIMIT ${batchSize}::int
        FOR UPDATE SKIP LOCKED
      )
      RETURNING
        id::text AS id,
        tenant_id,
        aggregate_type,
        aggregate_id,
        event_type,
        event_id,
        occurred_at,
        payload,
        status,
        attempts,
        max_attempts,
        available_at,
        processed_at,
        failed_at,
        dead_letter_reason,
        created_at,
        updated_at;
    `;

    return rows
      .map((row) => this.toRecord(row))
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  }

  async markProcessed(id: string, workerId: string): Promise<void> {
    await this.prisma.outboxEvent.updateMany({
      // Only the worker holding the lease may complete the event.
      where: { id, lockedBy: workerId, status: OutboxStatus.PROCESSING },
      data: {
        status: OutboxStatus.PROCESSED,
        processedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  async markFailed(record: OutboxRecord, workerId: string, error: string): Promise<void> {
    const isDeadLetter = record.attempts >= record.maxAttempts;

    await this.prisma.outboxEvent.updateMany({
      where: { id: record.id, lockedBy: workerId, status: OutboxStatus.PROCESSING },
      data: {
        status: isDeadLetter ? OutboxStatus.DEAD_LETTER : OutboxStatus.FAILED,
        deadLetterReason: isDeadLetter ? error.slice(0, 2000) : null,
        failedAt: new Date(),
        availableAt: new Date(Date.now() + computeRetryDelayMs(record.attempts)),
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  /** Backlog figures for monitoring (outbox lag and dead letters). */
  async getStats(): Promise<{
    pending: number;
    processing: number;
    failed: number;
    deadLetter: number;
    oldestPendingAgeSeconds: number;
  }> {
    const [counts, oldest] = await Promise.all([
      this.prisma.outboxEvent.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.outboxEvent.findFirst({
        where: { status: { in: [OutboxStatus.PENDING, OutboxStatus.FAILED] } },
        orderBy: { occurredAt: 'asc' },
        select: { occurredAt: true },
      }),
    ]);

    const count = (status: OutboxStatus): number =>
      counts.find((row) => row.status === String(status))?._count._all ?? 0;

    return {
      pending: count(OutboxStatus.PENDING),
      processing: count(OutboxStatus.PROCESSING),
      failed: count(OutboxStatus.FAILED),
      deadLetter: count(OutboxStatus.DEAD_LETTER),
      oldestPendingAgeSeconds: oldest
        ? Math.max(0, Math.round((Date.now() - oldest.occurredAt.getTime()) / 1000))
        : 0,
    };
  }

  async deleteProcessed(batchSize = DEFAULT_BATCH_SIZE): Promise<number> {
    const result = await this.prisma.$executeRaw`
      DELETE FROM outbox_events
      WHERE id IN (
        SELECT id
        FROM outbox_events
        WHERE status = ${OutboxStatus.PROCESSED}
        ORDER BY processed_at ASC
        LIMIT ${batchSize}::int
      );
    `;

    return Number(result);
  }

  private toCreateInput(event: BaseDomainEvent): Prisma.OutboxEventCreateManyInput {
    const payload = this.toPayload(event);

    return {
      id: createId(),
      tenantId: payload.tenantId ?? null,
      aggregateType: payload.aggregateType ?? null,
      aggregateId: payload.aggregateId ?? null,
      eventType: payload.eventType,
      eventId: payload.eventId,
      occurredAt: payload.occurredAt,
      payload: payload.payload as Prisma.InputJsonValue,
      status: OutboxStatus.PENDING,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
    };
  }

  private toPayload(event: BaseDomainEvent): OutboxPayload {
    const payload = JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
    const aggregate = inferAggregate(payload);

    return {
      eventId: event.eventId,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      tenantId: getString(payload.tenantId),
      aggregateId: getString(payload.aggregateId) ?? aggregate?.id,
      aggregateType: getString(payload.aggregateType) ?? aggregate?.type,
      payload,
    };
  }

  private toRecord(row: OutboxRow): OutboxRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id ?? undefined,
      aggregateType: row.aggregate_type ?? undefined,
      aggregateId: row.aggregate_id ?? undefined,
      eventType: row.event_type,
      eventId: row.event_id,
      occurredAt: row.occurred_at,
      payload: row.payload,
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      availableAt: row.available_at,
      processedAt: row.processed_at,
      failedAt: row.failed_at,
      deadLetterReason: row.dead_letter_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Domain events carry their aggregate's id under a type-specific name. */
const AGGREGATE_ID_FIELDS: Array<[field: string, type: string]> = [
  ['ticketId', 'Ticket'],
  ['customerId', 'Customer'],
  ['userId', 'User'],
];

function inferAggregate(
  payload: Record<string, unknown>,
): { id: string; type: string } | undefined {
  for (const [field, type] of AGGREGATE_ID_FIELDS) {
    const id = payload[field];
    if (typeof id === 'string' && id.length > 0) {
      return { id, type };
    }
  }
  return undefined;
}
