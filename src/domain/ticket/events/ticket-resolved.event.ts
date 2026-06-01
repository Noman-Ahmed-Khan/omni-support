import { BaseDomainEvent } from '../../shared/base.event';

export class TicketResolvedEvent extends BaseDomainEvent {
  constructor(
    public readonly ticketId: string,
    public readonly tenantId: string,
    public readonly customerId: string,
    public readonly agentId: string | undefined,
    public readonly resolvedById: string,
  ) {
    super('TICKET_RESOLVED');
  }
}