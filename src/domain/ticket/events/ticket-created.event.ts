import { BaseDomainEvent } from '../../shared/base.event';

export class TicketCreatedEvent extends BaseDomainEvent {
  constructor(
    public readonly ticketId: string,
    public readonly tenantId: string,
    public readonly customerId: string,
    public readonly createdById: string,
    public readonly priority: string,
    public readonly category: string,
  ) {
    super('TICKET_CREATED');
  }
}