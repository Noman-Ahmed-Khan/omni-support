import { ListTicketsQuery } from '../queries/list-tickets.query';
import { TicketService } from '../services/ticket.service';

export class ListTicketsHandler {
  constructor(private readonly ticketService: TicketService) {}

  async execute(query: ListTicketsQuery): Promise<unknown> {
    return this.ticketService.listTickets(query.filters, query.pagination);
  }
}
