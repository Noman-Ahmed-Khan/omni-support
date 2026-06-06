import { randomUUID } from 'crypto';

export abstract class BaseDomainEvent {
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly eventType: string;

  constructor(eventType: string) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.eventType = eventType;
  }
}
