import type { TicketEntity } from '../../../domain/ticket/entities/ticket.entity';
import type { ResolveTicketCommand } from '../commands/resolve-ticket.command';
import type { TicketService } from '../services/ticket.service';

export class ResolveTicketHandler {
  constructor(private readonly ticketService: TicketService) {}

  async execute(command: ResolveTicketCommand): Promise<TicketEntity> {
    return this.ticketService.changeStatus({
      tenantId: command.tenantId,
      ticketId: command.ticketId,
      newStatus: 'RESOLVED',
      changedById: command.resolvedById,
      changedByRole: command.resolvedByRole,
    });
  }
}
