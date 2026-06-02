import { ListTicketsQuery } from '../queries/list-tickets.query';
import { TicketService } from '../services/ticket.service';
import { PaginatedResult } from '../../../domain/ticket/repositories/ticket.repository.interface';
import { TicketEntity } from '../../../domain/ticket/entities/ticket.entity';

export class ListTicketsHandler {
  constructor(private readonly ticketService: TicketService) {}

  async execute(query: ListTicketsQuery): Promise<PaginatedResult<TicketEntity>> {
    return this.ticketService.listTickets(query.filters, query.pagination);
  }
}
