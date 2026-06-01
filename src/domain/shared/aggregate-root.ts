import { BaseDomainEvent } from './base.event';
import { BaseEntity } from './base.entity';

export abstract class AggregateRoot extends BaseEntity {
  private _domainEvents: BaseDomainEvent[] = [];

  protected addDomainEvent(event: BaseDomainEvent): void {
    this._domainEvents.push(event);
  }

  public pullDomainEvents(): BaseDomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }

  public get domainEvents(): ReadonlyArray<BaseDomainEvent> {
    return this._domainEvents;
  }
}