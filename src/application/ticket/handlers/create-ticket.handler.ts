import type { TicketEntity } from '../../../domain/ticket/entities/ticket.entity';
import type { CreateTicketCommand } from '../commands/create-ticket.command';
import type { TicketService } from '../services/ticket.service';

export class CreateTicketHandler {
  constructor(private readonly ticketService: TicketService) {}

  async execute(command: CreateTicketCommand): Promise<TicketEntity> {
    return this.ticketService.createTicket(command);
  }
}
