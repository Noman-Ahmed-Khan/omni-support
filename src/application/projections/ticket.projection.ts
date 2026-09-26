import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { logger } from '../../shared/utils/logger.util';

type TicketSearchRow = {
  id: string;
  ticketNumber: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  rank: number;
};

type CommentSearchRow = {
  id: string;
  ticketId: string;
  content: string;
  ticketNumber: number;
  ticketTitle: string;
  rank: number;
};

export interface TicketSearchResult {
  id: string;
  title: string;
  excerpt: string;
  url: string;
  metadata: Record<string, unknown>;
  rank: number;
}

export interface TicketSearchScope {
  /** Restricts results to tickets assigned to this agent. */
  assignedAgentId?: string;
}

// "searchVector" columns are maintained by database triggers
// (migration 20260915000300_search_vectors) and indexed with GIN.
const TICKET_DOCUMENT = Prisma.sql`t."searchVector"`;
const COMMENT_DOCUMENT = Prisma.sql`tc."searchVector"`;

export class TicketProjection {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Full-text search over ticket title and description. `query` is user input and is
   * parsed with websearch_to_tsquery, which never throws on arbitrary text.
   */
  async searchTickets(
    tenantId: string,
    query: string,
    limit = 10,
    scope: TicketSearchScope = {},
  ): Promise<TicketSearchResult[]> {
    try {
      const results = await this.prisma.$queryRaw<TicketSearchRow[]>`
        SELECT
          t."id",
          t."ticketNumber",
          t."title",
          t."description",
          t."status"::text AS "status",
          t."priority"::text AS "priority",
          ts_rank(${TICKET_DOCUMENT}, websearch_to_tsquery('english', ${query}))::float8 AS "rank"
        FROM "tickets" t
        WHERE t."tenantId" = ${tenantId}
          AND ${TICKET_DOCUMENT} @@ websearch_to_tsquery('english', ${query})
          ${scope.assignedAgentId ? Prisma.sql`AND t."assignedAgentId" = ${scope.assignedAgentId}` : Prisma.empty}
        ORDER BY "rank" DESC
        LIMIT ${limit}
      `;

      return results.map((row) => ({
        id: row.id,
        title: `#${row.ticketNumber} - ${row.title}`,
        excerpt: row.description.substring(0, 200),
        url: `/tickets/${row.id}`,
        metadata: { status: row.status, priority: row.priority },
        rank: Number(row.rank),
      }));
    } catch (error) {
      logger.error('Ticket search failed', { tenantId, error });
      return [];
    }
  }

  /** Searches public comments only; internal notes are never returned by search. */
  async searchComments(
    tenantId: string,
    query: string,
    limit = 10,
    scope: TicketSearchScope = {},
  ): Promise<TicketSearchResult[]> {
    try {
      const results = await this.prisma.$queryRaw<CommentSearchRow[]>`
        SELECT
          tc."id",
          tc."ticketId",
          tc."content",
          t."ticketNumber",
          t."title" AS "ticketTitle",
          ts_rank(${COMMENT_DOCUMENT}, websearch_to_tsquery('english', ${query}))::float8 AS "rank"
        FROM "ticket_comments" tc
        JOIN "tickets" t ON t."id" = tc."ticketId" AND t."tenantId" = tc."tenantId"
        WHERE tc."tenantId" = ${tenantId}
          AND tc."type" = 'PUBLIC'
          AND ${COMMENT_DOCUMENT} @@ websearch_to_tsquery('english', ${query})
          ${scope.assignedAgentId ? Prisma.sql`AND t."assignedAgentId" = ${scope.assignedAgentId}` : Prisma.empty}
        ORDER BY "rank" DESC
        LIMIT ${limit}
      `;

      return results.map((row) => ({
        id: row.id,
        title: `Comment on #${row.ticketNumber} - ${row.ticketTitle}`,
        excerpt: row.content.substring(0, 200),
        url: `/tickets/${row.ticketId}#comment-${row.id}`,
        metadata: { ticketId: row.ticketId },
        rank: Number(row.rank),
      }));
    } catch (error) {
      logger.error('Comment search failed', { tenantId, error });
      return [];
    }
  }
}
