import type { Request, Response, NextFunction } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';

import type { SearchService } from '../../../application/search/services/search.service';
import { successResponse } from '../dtos/common/response.dto';

interface SearchQuery {
  q?: string;
  types?: string;
  page?: string;
  limit?: string;
}

export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  async search(
    req: Request<ParamsDictionary, unknown, unknown, SearchQuery>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { q, types, page, limit } = req.query;
      const parsedTypes = types
        ? (types
            .split(',')
            .map((type) => type.trim())
            .filter(Boolean) as ('ticket' | 'customer' | 'comment')[])
        : undefined;

      const pageNumber = clampInt(page, 1, 1, 1000);
      const pageSize = clampInt(limit, 20, 1, 100);

      const result = await this.searchService.search({
        tenantId: req.tenantId!,
        query: q ?? '',
        types: parsedTypes,
        page: pageNumber,
        limit: pageSize,
        // Agents only see tickets assigned to them (same rule as the ticket list).
        assignedAgentId: req.user!.role === 'AGENT' ? req.user!.id : undefined,
      });

      res.status(200).json(
        successResponse(result.results, {
          total: result.total,
          page: pageNumber,
          limit: pageSize,
          totalPages: Math.ceil(result.total / pageSize),
        }),
      );
    } catch (error) {
      next(error);
    }
  }
}

function clampInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
}
