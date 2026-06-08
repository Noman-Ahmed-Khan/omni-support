import type { OutboxRepository } from './outbox.repository';
import type { BaseDomainEvent } from '../../domain/shared/base.event';
import { logger } from '../../shared/utils/logger.util';

export interface OutboxEventDispatcher {
  publish(event: BaseDomainEvent): Promise<void>;
}

export class OutboxProcessor {
  constructor(
    private readonly repository: OutboxRepository,
    private readonly dispatcher: OutboxEventDispatcher,
  ) {}

  async processBatch(batchSize = 100): Promise<number> {
    const events = await this.repository.fetchPending(batchSize);
    let processed = 0;

    for (const record of events) {
      try {
        await this.repository.markProcessing(record.id);

        await this.dispatcher.publish(this.toDomainEvent(record));

        await this.repository.markProcessed(record.id);
        processed += 1;
      } catch (error) {
        const attempts = record.attempts + 1;
        const message = error instanceof Error ? error.message : String(error);

        logger.error('Outbox event processing failed', {
          outboxId: record.id,
          eventType: record.eventType,
          attempts,
          error,
        });

        await this.repository.markFailed(record.id, message, attempts);
      }
    }

    return processed;
  }

  private toDomainEvent(record: {
    eventId: string;
    eventType: string;
    occurredAt: Date;
    payload: Record<string, unknown>;
  }): BaseDomainEvent {
    const event = {
      ...record.payload,
      eventId: record.eventId,
      eventType: record.eventType,
      occurredAt: record.occurredAt,
    } as BaseDomainEvent;

    return event;
  }
}
