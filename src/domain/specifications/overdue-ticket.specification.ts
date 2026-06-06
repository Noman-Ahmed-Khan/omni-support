import { TicketEntity } from '../ticket/entities/ticket.entity';

export class OverdueTicketSpecification {
  constructor(private readonly referenceDate: Date = new Date()) {}

  isSatisfiedBy(ticket: TicketEntity): boolean {
    return Boolean(
      ticket.dueAt &&
      ticket.dueAt.getTime() < this.referenceDate.getTime() &&
      ticket.isActive() &&
      !ticket.slaBreached,
    );
  }
}
