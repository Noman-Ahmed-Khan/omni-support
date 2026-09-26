import type { CustomerSearchResult } from '../../application/projections/customer.projection';
import type {
  TicketSearchResult,
  TicketSearchScope,
} from '../../application/projections/ticket.projection';

export interface ISearchProvider {
  searchTickets(
    tenantId: string,
    query: string,
    limit?: number,
    scope?: TicketSearchScope,
  ): Promise<TicketSearchResult[]>;
  searchCustomers(
    tenantId: string,
    query: string,
    limit?: number,
  ): Promise<CustomerSearchResult[]>;
  searchComments(
    tenantId: string,
    query: string,
    limit?: number,
    scope?: TicketSearchScope,
  ): Promise<TicketSearchResult[]>;
}
