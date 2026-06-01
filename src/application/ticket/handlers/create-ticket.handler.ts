import { TicketEntity } from '../../../domain/ticket/entities/ticket.entity';
import { CreateTicketCommand } from '../commands/create-ticket.command';
import { TicketService } from '../services/ticket.service';

export class CreateTicketHandler {
  constructor(private readonly ticketService: TicketService) {}

  async execute(command: CreateTicketCommand): Promise<TicketEntity> {
    return this.ticketService.createTicket(command);
  }
}
