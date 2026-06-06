import { TicketEntity } from '../ticket/entities/ticket.entity';

export class EscalatedTicketSpecification {
  isSatisfiedBy(ticket: TicketEntity): boolean {
    return ticket.isEscalated && ticket.isActive();
  }
}
