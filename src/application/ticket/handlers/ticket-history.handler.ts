import { TicketHistoryQuery } from '../queries/ticket-history.query';
import { TicketService } from '../services/ticket.service';

export class TicketHistoryHandler {
  constructor(private readonly ticketService: TicketService) {}

  async execute(query: TicketHistoryQuery): Promise<{
    data: unknown[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    return this.ticketService.getTicketHistory(
      query.ticketId,
      query.tenantId,
      query.page,
      query.limit,
    );
  }
}
