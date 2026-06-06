import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { TracingService } from './tracing.service';

export function createTracingMiddleware(tracingService: TracingService) {
  return function tracingMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): void {
    const traceId = req.correlationId ?? randomUUID();
    void tracingService.run(
      {
        traceId,
        correlationId: req.correlationId,
        tenantId: req.tenantId,
        userId: req.user?.id,
        path: req.path,
        method: req.method,
      },
      () => {
        next();
        return Promise.resolve();
      },
    );
  };
}
