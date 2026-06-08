import type { PrismaClient } from '@prisma/client';

import type { OutboxPayload, OutboxRecord } from './outbox.entity';
import { OutboxStatus } from './outbox.entity';
import type { BaseDomainEvent } from '../../domain/shared/base.event';
import { createId } from '../../shared/utils/id.util';

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BATCH_SIZE = 100;

export class OutboxRepository {
  private schemaEnsured = false;

  constructor(private readonly prisma: PrismaClient) {}

  async ensureSchema(): Promise<void> {
    if (this.schemaEnsured) {
      return;
    }

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS outbox_events (
        id uuid PRIMARY KEY,
        tenant_id text NULL,
        aggregate_type text NULL,
        aggregate_id text NULL,
        event_type text NOT NULL,
        event_id text NOT NULL UNIQUE,
        occurred_at timestamptz NOT NULL,
        payload jsonb NOT NULL,
        status text NOT NULL DEFAULT 'PENDING',
        attempts integer NOT NULL DEFAULT 0,
        max_attempts integer NOT NULL DEFAULT ${DEFAULT_MAX_ATTEMPTS},
        available_at timestamptz NOT NULL DEFAULT now(),
        processed_at timestamptz NULL,
        failed_at timestamptz NULL,
        dead_letter_reason text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS outbox_events_status_available_at_idx
      ON outbox_events (status, available_at);
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS outbox_events_tenant_status_idx
      ON outbox_events (tenant_id, status);
    `);

    this.schemaEnsured = true;
  }

  async enqueue(event: BaseDomainEvent): Promise<OutboxRecord> {
    await this.ensureSchema();

    const payload = this.toPayload(event);
    const id = createId();

    await this.prisma.$executeRaw`
      INSERT INTO outbox_events (
        id,
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
        created_at,
        updated_at
      ) VALUES (
        ${id},
        ${payload.tenantId ?? null},
        ${payload.aggregateType ?? null},
        ${payload.aggregateId ?? null},
        ${payload.eventType},
        ${payload.eventId},
        ${payload.occurredAt},
        ${JSON.stringify(payload.payload)}::jsonb,
        ${OutboxStatus.PENDING},
        0,
        ${DEFAULT_MAX_ATTEMPTS},
        NOW(),
        NOW(),
        NOW()
      )
      ON CONFLICT (event_id) DO NOTHING;
    `;

    return {
      id,
      ...payload,
      status: OutboxStatus.PENDING,
      attempts: 0,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      availableAt: new Date(),
      processedAt: null,
      failedAt: null,
      deadLetterReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async enqueueMany(events: BaseDomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.enqueue(event);
    }
  }

  async fetchPending(batchSize = DEFAULT_BATCH_SIZE): Promise<OutboxRecord[]> {
    await this.ensureSchema();

    const rows = await this.prisma.$queryRaw<
      Array<{
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
      }>
    >`
      SELECT
        id,
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
        updated_at
      FROM outbox_events
      WHERE status IN ('PENDING', 'FAILED')
        AND available_at <= NOW()
      ORDER BY occurred_at ASC
      LIMIT ${batchSize};
    `;

    return rows.map((row) => this.toRecord(row));
  }

  async markProcessing(id: string): Promise<void> {
    await this.ensureSchema();

    await this.prisma.$executeRaw`
      UPDATE outbox_events
      SET status = ${OutboxStatus.PROCESSING}, updated_at = NOW()
      WHERE id = ${id};
    `;
  }

  async markProcessed(id: string): Promise<void> {
    await this.ensureSchema();

    await this.prisma.$executeRaw`
      UPDATE outbox_events
      SET status = ${OutboxStatus.PROCESSED},
          processed_at = NOW(),
          updated_at = NOW()
      WHERE id = ${id};
    `;
  }

  async markFailed(
    id: string,
    error: string,
    attempts: number,
    retryDelayMs = 1000,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
  ): Promise<void> {
    await this.ensureSchema();

    const isDeadLetter = attempts >= maxAttempts;

    await this.prisma.$executeRaw`
      UPDATE outbox_events
      SET
        status = ${isDeadLetter ? OutboxStatus.DEAD_LETTER : OutboxStatus.FAILED},
        attempts = ${attempts},
        dead_letter_reason = ${isDeadLetter ? error : null},
        failed_at = NOW(),
        available_at = ${isDeadLetter ? new Date() : new Date(Date.now() + retryDelayMs)},
        updated_at = NOW()
      WHERE id = ${id};
    `;
  }

  async deleteProcessed(batchSize = DEFAULT_BATCH_SIZE): Promise<number> {
    await this.ensureSchema();

    const result = await this.prisma.$executeRaw`
      DELETE FROM outbox_events
      WHERE id IN (
        SELECT id
        FROM outbox_events
        WHERE status = ${OutboxStatus.PROCESSED}
        ORDER BY processed_at ASC
        LIMIT ${batchSize}
      );
    `;

    return Number(result);
  }

  private toPayload(event: BaseDomainEvent): OutboxPayload {
    const payload = JSON.parse(JSON.stringify(event)) as Record<string, unknown>;

    return {
      eventId: event.eventId,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      tenantId: getString(payload.tenantId),
      aggregateId: getString(payload.aggregateId),
      aggregateType: getString(payload.aggregateType),
      payload,
    };
  }

  private toRecord(row: {
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
  }): OutboxRecord {
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
