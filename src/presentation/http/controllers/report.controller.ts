import type { Request, Response, NextFunction } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { z } from 'zod';

import type { ReportQueue } from '../../../infrastructure/queue/queues/report.queue';
import { successResponse } from '../dtos/common/response.dto';

export const generateReportSchema = z.object({
  jobType: z.enum(['summary', 'export', 'snapshot']),
  format: z.enum(['json', 'csv']).optional(),
  filters: z.record(z.unknown()).optional(),
});

export type GenerateReportDto = z.infer<typeof generateReportSchema>;

export class ReportController {
  constructor(private readonly reportQueue: ReportQueue) {}

  async generateReport(
    req: Request<ParamsDictionary, unknown, GenerateReportDto, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const data = req.body;

      await this.reportQueue.add({
        tenantId: req.tenantId!,
        jobType: data.jobType,
        requestedById: req.user!.id,
        format: data.format,
        filters: data.filters,
      });

      res
        .status(202)
        .json(successResponse({ message: 'Report generation queued successfully' }));
    } catch (error) {
      next(error);
    }
  }
}
