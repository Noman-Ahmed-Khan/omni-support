import type { PrismaClient } from '@prisma/client';

type TicketSearchRow = {
  id: string;
  ticket_number: number;
  title: string;
  description: string;
  status: string;
  priority: string;
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

export interface TicketSearchResult {
  id: string;
  title: string;
  excerpt: string;
  url: string;
  metadata: Record<string, unknown>;
  rank: number;
}

export class TicketProjection {
  constructor(private readonly prisma: PrismaClient) {}

  async searchTickets(
    tenantId: string,
    query: string,
    limit = 10,
  ): Promise<TicketSearchResult[]> {
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
        LIMIT ${limit}
      `;

      return results.map((row) => ({
        id: row.id,
        title: `#${row.ticket_number} - ${row.title}`,
        excerpt: row.description.substring(0, 200),
        url: `/tickets/${row.id}`,
        metadata: { status: row.status, priority: row.priority },
        rank: parseFloat(row.rank),
      }));
    } catch {
      return [];
    }
  }

  async searchComments(
    tenantId: string,
    query: string,
    limit = 10,
  ): Promise<TicketSearchResult[]> {
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
        LIMIT ${limit}
      `;

      return results.map((row) => ({
        id: row.id,
        title: `Comment on #${row.ticket_number} - ${row.ticket_title}`,
        excerpt: row.content.substring(0, 200),
        url: `/tickets/${row.ticket_id}#comment-${row.id}`,
        metadata: { ticketId: row.ticket_id },
        rank: parseFloat(row.rank),
      }));
    } catch {
      return [];
    }
  }
}
