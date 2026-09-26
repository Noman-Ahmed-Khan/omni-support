import { randomUUID } from 'crypto';
import os from 'os';

import type { OutboxRecord } from './outbox.entity';
import type { OutboxRepository } from './outbox.repository';
import type { BaseDomainEvent } from '../../domain/shared/base.event';
import { logger } from '../../shared/utils/logger.util';

export interface OutboxEventDispatcher {
  /** Must reject when delivery failed so the event is retried. */
  publish(event: BaseDomainEvent): Promise<void>;
}

export interface OutboxProcessorOptions {
  workerId?: string;
  /** How long a claimed event stays locked before another worker may reclaim it. */
  leaseMs?: number;
}

export class OutboxProcessor {
  private readonly workerId: string;
  private readonly leaseMs: number;

  constructor(
    private readonly repository: OutboxRepository,
    private readonly dispatcher: OutboxEventDispatcher,
    options: OutboxProcessorOptions = {},
  ) {
    this.workerId =
      options.workerId ?? `${os.hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
    this.leaseMs = options.leaseMs ?? 5 * 60 * 1000;
  }

  async processBatch(batchSize = 100): Promise<number> {
    const events = await this.repository.claimBatch(
      this.workerId,
      batchSize,
      this.leaseMs,
    );
    let processed = 0;

    for (const record of events) {
      try {
        await this.dispatcher.publish(this.toDomainEvent(record));
        await this.repository.markProcessed(record.id, this.workerId);
        processed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const deadLetter = record.attempts >= record.maxAttempts;

        logger.error('Outbox event processing failed', {
          outboxId: record.id,
          eventType: record.eventType,
          attempts: record.attempts,
          maxAttempts: record.maxAttempts,
          deadLetter,
          error,
        });

        await this.repository.markFailed(record, this.workerId, message);
      }
    }

    return processed;
  }

  private toDomainEvent(record: OutboxRecord): BaseDomainEvent {
    return {
      ...record.payload,
      eventId: record.eventId,
      eventType: record.eventType,
      occurredAt: record.occurredAt,
    } as BaseDomainEvent;
  }
}
