import type { PrismaClient } from '@prisma/client';

type CustomerSearchRow = {
  id: string;
  full_name: string;
  email: string;
  company?: string | null;
  status: string;
  rank: string;
};

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
        LIMIT ${limit}
      `;

      return results.map((row) => ({
        id: row.id,
        title: row.full_name,
        excerpt: `${row.email}${row.company ? ` • ${row.company}` : ''}`,
        url: `/customers/${row.id}`,
        metadata: { email: row.email, status: row.status },
        rank: parseFloat(row.rank),
      }));
    } catch {
      return [];
    }
  }
}
