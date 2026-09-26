import type { Request, Response, NextFunction } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { z } from 'zod';

export const generateReportSchema = z.object({
  jobType: z.enum(['summary', 'export', 'snapshot']),
  format: z.enum(['json', 'csv']).optional(),
  filters: z.record(z.unknown()).optional(),
});

export type GenerateReportDto = z.infer<typeof generateReportSchema>;

export class ReportController {
  /**
   * Report generation has no processor yet. Previously jobs were queued and never
   * consumed, so the endpoint reports that the feature is unavailable instead of
   * returning a misleading 202.
   */
  generateReport(
    _req: Request<ParamsDictionary, unknown, GenerateReportDto, unknown>,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    res.status(501).json({
      type: 'https://omnisupport.io/errors/not-implemented',
      title: 'Not Implemented',
      status: 501,
      detail: 'Report generation is not available yet',
    });
    return Promise.resolve();
  }
}
