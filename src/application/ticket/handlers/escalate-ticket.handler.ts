import type { TicketEntity } from '../../../domain/ticket/entities/ticket.entity';
import type { EscalateTicketCommand } from '../commands/escalate-ticket.command';
import type { TicketService } from '../services/ticket.service';

export class EscalateTicketHandler {
  constructor(private readonly ticketService: TicketService) {}

  async execute(command: EscalateTicketCommand): Promise<TicketEntity> {
    return this.ticketService.escalateTicket(command);
  }
}
