import { TicketEntity } from '../../../domain/ticket/entities/ticket.entity';
import { GetTicketQuery } from '../queries/get-ticket.query';
import { TicketService } from '../services/ticket.service';

export class GetTicketHandler {
  constructor(private readonly ticketService: TicketService) {}

  async execute(query: GetTicketQuery): Promise<TicketEntity> {
    return this.ticketService.getTicket(query.ticketId, query.tenantId);
  }
}
