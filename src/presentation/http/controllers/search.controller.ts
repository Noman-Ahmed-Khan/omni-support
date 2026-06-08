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

      const result = await this.searchService.search({
        tenantId: req.tenantId!,
        query: q ?? '',
        types: parsedTypes,
        page: Number(page ?? 1),
        limit: Number(limit ?? 20),
      });

      res.status(200).json(
        successResponse(result.results, {
          total: result.total,
          page: Number(page ?? 1),
          limit: Number(limit ?? 20),
          totalPages: Math.ceil(result.total / Number(limit ?? 20)),
        }),
      );
    } catch (error) {
      next(error);
    }
  }
}
