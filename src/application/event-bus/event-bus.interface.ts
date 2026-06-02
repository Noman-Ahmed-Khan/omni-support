import { BaseDomainEvent } from '../../domain/shared/base.event';

export type EventHandler<T extends BaseDomainEvent = BaseDomainEvent> = (
  event: T,
) => Promise<void>;

export interface IEventBus {
  publish(event: BaseDomainEvent): Promise<void>;
  publishAll(events: BaseDomainEvent[]): Promise<void>;
  subscribe<T extends BaseDomainEvent>(eventType: string, handler: EventHandler<T>): void;
  unsubscribe(eventType: string, handler: EventHandler): void;
}
