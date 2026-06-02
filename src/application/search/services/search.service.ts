import { PrismaClient } from '@prisma/client';
import { logger } from '../../../shared/utils/logger.util';

type TicketSearchRow = {
  id: string;
  ticket_number: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  rank: string;
};

type CustomerSearchRow = {
  id: string;
  full_name: string;
  email: string;
  company?: string | null;
  status: string;
  rank: string;
};

type CommentSearchRow = {
  id: string;
  ticket_id: string;
  content: string;
  ticket_number: number;
  ticket_title: string;
  rank: string;
};

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
  constructor(private readonly prisma: PrismaClient) {}

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
      searchPromises.push(this.searchTickets(tenantId, sanitizedQuery));
    }

    if (types.includes('customer')) {
      searchPromises.push(this.searchCustomers(tenantId, sanitizedQuery));
    }

    if (types.includes('comment')) {
      searchPromises.push(this.searchComments(tenantId, sanitizedQuery));
    }

    const allResults = await Promise.all(searchPromises);
    allResults.forEach((r) => results.push(...r));

    // Sort by rank descending
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

  private async searchTickets(
    tenantId: string,
    query: string,
  ): Promise<SearchResult[]> {
    try {
      const results = await this.prisma.$queryRaw<TicketSearchRow[]>`
        SELECT
          id,
          ticket_number,
          title,
          description,
          status,
          priority,
          ts_rank(search_vector, to_tsquery('english', ${query})) as rank
        FROM tickets
        WHERE
          tenant_id = ${tenantId}
          AND search_vector @@ to_tsquery('english', ${query})
        ORDER BY rank DESC
        LIMIT 10
      `;

      return results.map((r) => ({
        type: 'ticket' as const,
        id: r.id,
        title: `#${r.ticket_number} - ${r.title}`,
        excerpt: r.description.substring(0, 200),
        url: `/tickets/${r.id}`,
        metadata: { status: r.status, priority: r.priority },
        rank: parseFloat(r.rank),
      }));
    } catch (error) {
      logger.error('Ticket search failed', { error });
      return [];
    }
  }

  private async searchCustomers(
    tenantId: string,
    query: string,
  ): Promise<SearchResult[]> {
    try {
      const results = await this.prisma.$queryRaw<CustomerSearchRow[]>`
        SELECT
          id,
          full_name,
          email,
          company,
          status,
          ts_rank(search_vector, to_tsquery('english', ${query})) as rank
        FROM customers
        WHERE
          tenant_id = ${tenantId}
          AND search_vector @@ to_tsquery('english', ${query})
        ORDER BY rank DESC
        LIMIT 10
      `;

      return results.map((r) => ({
        type: 'customer' as const,
        id: r.id,
        title: r.full_name,
        excerpt: `${r.email}${r.company ? ` • ${r.company}` : ''}`,
        url: `/customers/${r.id}`,
        metadata: { email: r.email, status: r.status },
        rank: parseFloat(r.rank),
      }));
    } catch (error) {
      logger.error('Customer search failed', { error });
      return [];
    }
  }

  private async searchComments(
    tenantId: string,
    query: string,
  ): Promise<SearchResult[]> {
    try {
      const results = await this.prisma.$queryRaw<CommentSearchRow[]>`
        SELECT
          tc.id,
          tc.ticket_id,
          tc.content,
          t.ticket_number,
          t.title as ticket_title,
          ts_rank(tc.search_vector, to_tsquery('english', ${query})) as rank
        FROM ticket_comments tc
        JOIN tickets t ON t.id = tc.ticket_id
        WHERE
          tc.tenant_id = ${tenantId}
          AND tc.type = 'PUBLIC'
          AND tc.search_vector @@ to_tsquery('english', ${query})
        ORDER BY rank DESC
        LIMIT 10
      `;

      return results.map((r) => ({
        type: 'comment' as const,
        id: r.id,
        title: `Comment on #${r.ticket_number} - ${r.ticket_title}`,
        excerpt: r.content.substring(0, 200),
        url: `/tickets/${r.ticket_id}#comment-${r.id}`,
        metadata: { ticketId: r.ticket_id },
        rank: parseFloat(r.rank),
      }));
    } catch (error) {
      logger.error('Comment search failed', { error });
      return [];
    }
  }
}