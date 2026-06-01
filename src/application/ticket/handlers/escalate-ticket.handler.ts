import { TicketEntity } from '../../../domain/ticket/entities/ticket.entity';
import { EscalateTicketCommand } from '../commands/escalate-ticket.command';
import { TicketService } from '../services/ticket.service';

export class EscalateTicketHandler {
  constructor(private readonly ticketService: TicketService) {}

  async execute(command: EscalateTicketCommand): Promise<TicketEntity> {
    return this.ticketService.escalateTicket(command);
  }
}
