import type { TicketEntity } from '../../../domain/ticket/entities/ticket.entity';
import type { UpdateTicketCommand } from '../commands/update-ticket.command';
import type { TicketService } from '../services/ticket.service';

export class UpdateTicketHandler {
  constructor(private readonly ticketService: TicketService) {}

  async execute(command: UpdateTicketCommand): Promise<TicketEntity> {
    return this.ticketService.updateTicket(command);
  }
}
