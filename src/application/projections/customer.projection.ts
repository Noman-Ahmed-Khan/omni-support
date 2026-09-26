import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { logger } from '../../shared/utils/logger.util';

type CustomerSearchRow = {
  id: string;
  fullName: string;
  email: string;
  company?: string | null;
  status: string;
  rank: number;
};

// Maintained by a database trigger (migration 20260915000300_search_vectors).
const CUSTOMER_DOCUMENT = Prisma.sql`c."searchVector"`;

export interface CustomerSearchResult {
  id: string;
  title: string;
  excerpt: string;
  url: string;
  metadata: Record<string, unknown>;
  rank: number;
}

export class CustomerProjection {
  constructor(private readonly prisma: PrismaClient) {}

  async searchCustomers(
    tenantId: string,
    query: string,
    limit = 10,
  ): Promise<CustomerSearchResult[]> {
    try {
      const results = await this.prisma.$queryRaw<CustomerSearchRow[]>`
        SELECT
          c."id",
          c."fullName",
          c."email",
          c."company",
          c."status"::text AS "status",
          ts_rank(${CUSTOMER_DOCUMENT}, websearch_to_tsquery('simple', ${query}))::float8 AS "rank"
        FROM "customers" c
        WHERE c."tenantId" = ${tenantId}
          AND ${CUSTOMER_DOCUMENT} @@ websearch_to_tsquery('simple', ${query})
        ORDER BY "rank" DESC
        LIMIT ${limit}
      `;

      return results.map((row) => ({
        id: row.id,
        title: row.fullName,
        excerpt: `${row.email}${row.company ? ` • ${row.company}` : ''}`,
        url: `/customers/${row.id}`,
        metadata: { email: row.email, status: row.status },
        rank: Number(row.rank),
      }));
    } catch (error) {
      logger.error('Customer search failed', { tenantId, error });
      return [];
    }
  }
}
