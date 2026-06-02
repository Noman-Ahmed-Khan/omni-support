import { BaseDomainEvent } from '../../shared/base.event';

export class TicketAssignedEvent extends BaseDomainEvent {
  constructor(
    public readonly ticketId: string,
    public readonly tenantId: string,
    public readonly customerId: string,
    public readonly agentId: string,
    public readonly previousAgentId: string | undefined,
    public readonly assignedById: string,
  ) {
    super('TICKET_ASSIGNED');
  }
}
