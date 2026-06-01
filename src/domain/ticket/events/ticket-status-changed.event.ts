import { BaseDomainEvent } from '../../shared/base.event';

export class TicketStatusChangedEvent extends BaseDomainEvent {
  constructor(
    public readonly ticketId: string,
    public readonly tenantId: string,
    public readonly oldStatus: string,
    public readonly newStatus: string,
    public readonly changedById: string,
  ) {
    super('TICKET_STATUS_CHANGED');
  }
}