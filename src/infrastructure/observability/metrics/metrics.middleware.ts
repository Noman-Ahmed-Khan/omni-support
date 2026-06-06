import { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';

export function createMetricsMiddleware(metrics: MetricsService) {
  return function metricsMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const start = Date.now();

    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const route = (req.route as { path?: string } | undefined)?.path ?? req.path;
      metrics.observeHttpRequest(
        {
          method: req.method,
          route,
          statusCode: res.statusCode,
        },
        durationMs,
        req.tenantId,
      );
    });

    next();
  };
}
