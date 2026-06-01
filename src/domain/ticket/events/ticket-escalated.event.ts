import { BaseDomainEvent } from '../../shared/base.event';

export class TicketEscalatedEvent extends BaseDomainEvent {
  constructor(
    public readonly ticketId: string,
    public readonly tenantId: string,
    public readonly customerId: string,
    public readonly assignedAgentId: string | undefined,
    public readonly reason: string,
    public readonly escalatedById: string,
  ) {
    super('TICKET_ESCALATED');
  }
}