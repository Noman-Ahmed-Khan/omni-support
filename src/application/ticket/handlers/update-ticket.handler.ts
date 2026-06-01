import { TicketEntity } from '../../../domain/ticket/entities/ticket.entity';
import { UpdateTicketCommand } from '../commands/update-ticket.command';
import { TicketService } from '../services/ticket.service';

export class UpdateTicketHandler {
  constructor(private readonly ticketService: TicketService) {}

  async execute(command: UpdateTicketCommand): Promise<TicketEntity> {
    return this.ticketService.updateTicket(command);
  }
}
