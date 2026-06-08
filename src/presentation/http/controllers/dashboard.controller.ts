import type { Request, Response, NextFunction } from 'express';

import type { AnalyticsService } from '../../../application/analytics/services/analytics.service';
import { successResponse } from '../dtos/common/response.dto';

export class DashboardController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  async getDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const metrics = await this.analyticsService.getDashboardMetrics(req.tenantId!);

      res.status(200).json(successResponse(metrics));
    } catch (error) {
      next(error);
    }
  }
}
