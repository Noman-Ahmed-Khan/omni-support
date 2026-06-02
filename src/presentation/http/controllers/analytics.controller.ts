import { Request, Response, NextFunction } from 'express';
import { AnalyticsService } from '../../../application/analytics/services/analytics.service';
import { successResponse } from '../dtos/common/response.dto';

export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  async getDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const metrics = await this.analyticsService.getDashboardMetrics(req.tenantId!);

      res.status(200).json(successResponse(metrics));
    } catch (error) {
      next(error);
    }
  }

  async getTrends(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const days = Number(req.query.days ?? 30);
      const trends = await this.analyticsService.getTicketTrends(
        req.tenantId!,
        Math.min(days, 365),
      );

      res.status(200).json(successResponse(trends));
    } catch (error) {
      next(error);
    }
  }

  async getPlatformMetrics(
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const metrics = await this.analyticsService.getPlatformMetrics();
      res.status(200).json(successResponse(metrics));
    } catch (error) {
      next(error);
    }
  }
}
