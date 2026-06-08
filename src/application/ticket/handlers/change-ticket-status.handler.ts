import type { TicketEntity } from '../../../domain/ticket/entities/ticket.entity';
import type { TicketService } from '../services/ticket.service';

export interface ChangeTicketStatusCommand {
  tenantId: string;
  ticketId: string;
  newStatus: string;
  changedById: string;
  changedByRole: string;
}

export class ChangeTicketStatusHandler {
  constructor(private readonly ticketService: TicketService) {}

  async execute(command: ChangeTicketStatusCommand): Promise<TicketEntity> {
    return this.ticketService.changeStatus(command);
  }
}
