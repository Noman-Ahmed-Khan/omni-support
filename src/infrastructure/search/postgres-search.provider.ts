import type { PrismaClient } from '@prisma/client';

import type { ISearchProvider } from './search-provider.interface';
import { CustomerProjection } from '../../application/projections/customer.projection';
import { TicketProjection } from '../../application/projections/ticket.projection';

export class PostgresSearchProvider implements ISearchProvider {
  private readonly ticketProjection: TicketProjection;
  private readonly customerProjection: CustomerProjection;

  constructor(prisma: PrismaClient) {
    this.ticketProjection = new TicketProjection(prisma);
    this.customerProjection = new CustomerProjection(prisma);
  }

  async searchTickets(tenantId: string, query: string, limit = 10) {
    return this.ticketProjection.searchTickets(tenantId, query, limit);
  }

  async searchCustomers(tenantId: string, query: string, limit = 10) {
    return this.customerProjection.searchCustomers(tenantId, query, limit);
  }

  async searchComments(tenantId: string, query: string, limit = 10) {
    return this.ticketProjection.searchComments(tenantId, query, limit);
  }
}
