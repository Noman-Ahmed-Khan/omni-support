import type { TicketEntity } from '../../../domain/ticket/entities/ticket.entity';
import type { CloseTicketCommand } from '../commands/close-ticket.command';
import type { TicketService } from '../services/ticket.service';

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
