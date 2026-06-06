import { PrismaClient } from '@prisma/client';
import { logger } from '../../../shared/utils/logger.util';
import {
  CustomerProjection,
  CustomerSearchResult,
} from '../../projections/customer.projection';
import {
  TicketProjection,
  TicketSearchResult,
} from '../../projections/ticket.projection';

export interface SearchResult {
  type: 'ticket' | 'customer' | 'comment';
  id: string;
  title: string;
  excerpt: string;
  url: string;
  metadata: Record<string, unknown>;
  rank: number;
}

export interface SearchOptions {
  tenantId: string;
  query: string;
  types?: ('ticket' | 'customer' | 'comment')[];
  limit?: number;
  page?: number;
}

export class SearchService {
  private readonly ticketProjection: TicketProjection;
  private readonly customerProjection: CustomerProjection;

  constructor(prisma: PrismaClient) {
    this.ticketProjection = new TicketProjection(prisma);
    this.customerProjection = new CustomerProjection(prisma);
  }

  async search(options: SearchOptions): Promise<{
    results: SearchResult[];
    total: number;
  }> {
    const {
      tenantId,
      query,
      types = ['ticket', 'customer', 'comment'],
      limit = 20,
      page = 1,
    } = options;

    if (!query || query.trim().length < 2) {
      return { results: [], total: 0 };
    }

    const sanitizedQuery = query.trim().split(/\s+/).join(' & ');
    const results: SearchResult[] = [];
    const searchPromises: Promise<SearchResult[]>[] = [];

    if (types.includes('ticket')) {
      searchPromises.push(
        this.ticketProjection
          .searchTickets(tenantId, sanitizedQuery, 10)
          .then((rows) => rows.map((row) => this.toSearchResult('ticket', row))),
      );
    }

    if (types.includes('customer')) {
      searchPromises.push(
        this.customerProjection
          .searchCustomers(tenantId, sanitizedQuery, 10)
          .then((rows) => rows.map((row) => this.toSearchResult('customer', row))),
      );
    }

    if (types.includes('comment')) {
      searchPromises.push(
        this.ticketProjection
          .searchComments(tenantId, sanitizedQuery, 10)
          .then((rows) => rows.map((row) => this.toSearchResult('comment', row))),
      );
    }

    const allResults = await Promise.all(searchPromises);
    allResults.forEach((batch) => results.push(...batch));
    results.sort((a, b) => b.rank - a.rank);

    const start = (page - 1) * limit;
    const paginated = results.slice(start, start + limit);

    logger.debug('Search performed', {
      tenantId,
      query,
      totalResults: results.length,
    });

    return { results: paginated, total: results.length };
  }

  private toSearchResult(
    type: SearchResult['type'],
    result: TicketSearchResult | CustomerSearchResult,
  ): SearchResult {
    return {
      type,
      id: result.id,
      title: result.title,
      excerpt: result.excerpt,
      url: result.url,
      metadata: result.metadata,
      rank: result.rank,
    };
  }
}
