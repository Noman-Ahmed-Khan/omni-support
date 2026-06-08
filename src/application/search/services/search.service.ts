import type { PrismaClient } from '@prisma/client';

import { PostgresSearchProvider } from '../../../infrastructure/search/postgres-search.provider';
import type { ISearchProvider } from '../../../infrastructure/search/search-provider.interface';
import { logger } from '../../../shared/utils/logger.util';

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
  private readonly searchProvider: ISearchProvider;

  constructor(prisma: PrismaClient, searchProvider?: ISearchProvider) {
    this.searchProvider = searchProvider ?? new PostgresSearchProvider(prisma);
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
        this.searchProvider
          .searchTickets(tenantId, sanitizedQuery, 10)
          .then((rows) => rows.map((row) => this.toSearchResult('ticket', row))),
      );
    }

    if (types.includes('customer')) {
      searchPromises.push(
        this.searchProvider
          .searchCustomers(tenantId, sanitizedQuery, 10)
          .then((rows) => rows.map((row) => this.toSearchResult('customer', row))),
      );
    }

    if (types.includes('comment')) {
      searchPromises.push(
        this.searchProvider
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
    result: {
      id: string;
      title: string;
      excerpt: string;
      url: string;
      metadata: Record<string, unknown>;
      rank: number;
    },
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
