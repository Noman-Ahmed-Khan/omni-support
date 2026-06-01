import { Request, Response, NextFunction } from 'express';
import { SearchService } from '../../../application/search/services/search.service';
import { successResponse } from '../dtos/common/response.dto';

export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        q,
        types,
        page,
        limit,
      } = req.query as {
        q: string;
        types?: string;
        page?: string;
        limit?: string;
      };

      const result = await this.searchService.search({
        tenantId: req.tenantId!,
        query: q ?? '',
        types: types?.split(',') as any[],
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