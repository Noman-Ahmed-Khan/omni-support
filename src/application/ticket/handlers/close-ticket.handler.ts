import { TicketEntity } from '../../../domain/ticket/entities/ticket.entity';
import { CloseTicketCommand } from '../commands/close-ticket.command';
import { TicketService } from '../services/ticket.service';

export class CloseTicketHandler {
  constructor(private readonly ticketService: TicketService) {}

  async execute(command: CloseTicketCommand): Promise<TicketEntity> {
    return this.ticketService.changeStatus({
      tenantId: command.tenantId,
      ticketId: command.ticketId,
      newStatus: 'CLOSED',
      changedById: command.closedById,
      changedByRole: command.closedByRole,
    });
  }
}
