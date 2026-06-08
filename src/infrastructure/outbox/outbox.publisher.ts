import type { OutboxRepository } from './outbox.repository';
import type {
  EventHandler,
  IEventBus,
} from '../../application/event-bus/event-bus.interface';
import type { BaseDomainEvent } from '../../domain/shared/base.event';

export class OutboxPublisher implements IEventBus {
  constructor(
    private readonly outboxRepository: OutboxRepository,
    private readonly dispatcher: {
      subscribe<T extends BaseDomainEvent>(
        eventType: string,
        handler: EventHandler<T>,
      ): void;
      unsubscribe(eventType: string, handler: EventHandler): void;
      publish(event: BaseDomainEvent): Promise<void>;
    },
  ) {}

  async publish(event: BaseDomainEvent): Promise<void> {
    await this.outboxRepository.enqueue(event);
  }

  async publishAll(events: BaseDomainEvent[]): Promise<void> {
    await this.outboxRepository.enqueueMany(events);
  }

  subscribe<T extends BaseDomainEvent>(
    eventType: string,
    handler: EventHandler<T>,
  ): void {
    this.dispatcher.subscribe(eventType, handler);
  }

  unsubscribe(eventType: string, handler: EventHandler): void {
    this.dispatcher.unsubscribe(eventType, handler);
  }
}
