import { BaseDomainEvent } from '../../domain/shared/base.event';
import { IEventBus, EventHandler } from './event-bus.interface';
import { logger } from '../../shared/utils/logger.util';

export class InProcessEventBus implements IEventBus {
  private readonly handlers: Map<string, EventHandler[]> = new Map();

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
      eventHandlers.map((handler) => handler(event)),
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const reason: unknown = result.reason;
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

  subscribe<T extends BaseDomainEvent>(
    eventType: string,
    handler: EventHandler<T>,
  ): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers
      .get(eventType)!
      .push(handler);

    logger.debug('Event handler registered', { eventType });
  }

  unsubscribe(eventType: string, handler: EventHandler): void {
    const eventHandlers = this.handlers.get(eventType) ?? [];
    const filtered = eventHandlers.filter((h) => h !== handler);
    this.handlers.set(eventType, filtered);
  }
}
