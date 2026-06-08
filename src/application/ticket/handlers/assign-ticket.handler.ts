import type { TicketEntity } from '../../../domain/ticket/entities/ticket.entity';
import type { AssignTicketCommand } from '../commands/assign-ticket.command';
import type { TicketService } from '../services/ticket.service';

export class AssignTicketHandler {
  constructor(private readonly ticketService: TicketService) {}

  async execute(command: AssignTicketCommand): Promise<TicketEntity> {
    return this.ticketService.assignTicket(command);
  }
}
