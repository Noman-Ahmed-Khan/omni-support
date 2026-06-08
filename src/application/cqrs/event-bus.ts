import type { EventHandler } from './event-handler.interface';
import type { BaseDomainEvent } from '../../domain/shared/base.event';
import { logger } from '../../shared/utils/logger.util';

interface RegisteredEventHandler {
  handler: EventHandler<BaseDomainEvent>;
}

export class EventBus {
  private readonly handlers = new Map<string, RegisteredEventHandler[]>();

  subscribe<TEvent extends BaseDomainEvent>(
    eventType: string,
    handler: EventHandler<TEvent>,
  ): void {
    const eventHandlers = this.handlers.get(eventType) ?? [];
    eventHandlers.push({ handler: handler as EventHandler<BaseDomainEvent> });
    this.handlers.set(eventType, eventHandlers);
  }

  unsubscribe<TEvent extends BaseDomainEvent>(
    eventType: string,
    handler: EventHandler<TEvent>,
  ): void {
    const eventHandlers = this.handlers.get(eventType) ?? [];
    this.handlers.set(
      eventType,
      eventHandlers.filter((entry) => entry.handler !== handler),
    );
  }

  async publish(event: BaseDomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.eventType) ?? [];

    if (handlers.length === 0) {
      logger.debug('No event handlers registered', {
        eventType: event.eventType,
        eventId: event.eventId,
      });
      return;
    }

    const results = await Promise.allSettled(
      handlers.map((entry) => entry.handler.handle(event)),
    );

    results.forEach((result: PromiseSettledResult<void>, index: number) => {
      if (result.status === 'rejected') {
        const reason =
          result.reason instanceof Error
            ? result.reason
            : new Error(String(result.reason));
        logger.error('Event handler failed', {
          eventType: event.eventType,
          eventId: event.eventId,
          handlerIndex: index,
          error: reason,
        });
      }
    });
  }

  async publishAll(events: BaseDomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  listRegisteredEventTypes(): string[] {
    return [...this.handlers.keys()].sort();
  }
}
