export interface Event {
  readonly eventType?: string;
  readonly eventId?: string;
  readonly occurredAt?: Date;
  readonly tenantId?: string;
  readonly aggregateId?: string;
  readonly aggregateType?: string;
}
