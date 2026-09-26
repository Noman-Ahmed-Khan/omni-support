import type { IEventBus, EventHandler } from './event-bus.interface';
import type { BaseDomainEvent } from '../../domain/shared/base.event';
import { logger } from '../../shared/utils/logger.util';

/**
 * Remembers which handlers already processed an event, so that when a delivery is
 * retried (e.g. by the outbox after another handler failed) successful side effects
 * such as emails are not repeated.
 */
export interface HandlerLedger {
  isDone(key: string): Promise<boolean>;
  markDone(key: string): Promise<void>;
}

export class InProcessEventBus implements IEventBus {
  private readonly handlers: Map<string, EventHandler[]> = new Map();

  constructor(private readonly ledger?: HandlerLedger) {}

  async publish(event: BaseDomainEvent): Promise<void> {
    const eventHandlers = this.handlers.get(event.eventType) ?? [];

    if (eventHandlers.length === 0) {
      logger.debug('No handlers registered for event', {
        eventType: event.eventType,
        eventId: event.eventId,
      });
      return;
    }

    logger.debug('Publishing domain event', {
      eventType: event.eventType,
      eventId: event.eventId,
      handlerCount: eventHandlers.length,
    });

    const results = await Promise.allSettled(
      eventHandlers.map((handler, index) => this.runOnce(event, handler, index)),
    );

    const failures: unknown[] = [];

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const reason: unknown = result.reason;
        failures.push(reason);
        logger.error('Event handler failed', {
          eventType: event.eventType,
          eventId: event.eventId,
          handlerIndex: index,
          error: reason,
        });
      }
    });

    // Surface failures so the outbox can retry delivery.
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `${failures.length} handler(s) failed for ${event.eventType}`,
      );
    }
  }

  /** Handlers are identified by event type and registration order, which is fixed at startup. */
  private async runOnce(
    event: BaseDomainEvent,
    handler: EventHandler,
    index: number,
  ): Promise<void> {
    if (!this.ledger) {
      await handler(event);
      return;
    }

    const key = `${event.eventId}:${event.eventType}:${index}`;
    if (await this.ledger.isDone(key)) {
      return;
    }

    await handler(event);
    await this.ledger.markDone(key);
  }

  async publishAll(events: BaseDomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  subscribe<T extends BaseDomainEvent>(
    eventType: string,
    handler: EventHandler<T>,
  ): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler as EventHandler);

    logger.debug('Event handler registered', { eventType });
  }

  unsubscribe(eventType: string, handler: EventHandler): void {
    const eventHandlers = this.handlers.get(eventType) ?? [];
    const filtered = eventHandlers.filter((h) => h !== handler);
    this.handlers.set(eventType, filtered);
  }
}
