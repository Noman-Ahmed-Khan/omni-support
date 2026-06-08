import type { TicketEntity } from '../../../domain/ticket/entities/ticket.entity';
import type { PaginatedResult } from '../../../domain/ticket/repositories/ticket.repository.interface';
import type { ListTicketsQuery } from '../queries/list-tickets.query';
import type { TicketService } from '../services/ticket.service';

export class ListTicketsHandler {
  constructor(private readonly ticketService: TicketService) {}

  async execute(query: ListTicketsQuery): Promise<PaginatedResult<TicketEntity>> {
    return this.ticketService.listTickets(query.filters, query.pagination);
  }
}
