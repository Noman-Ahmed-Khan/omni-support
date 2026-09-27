import type { Request, Response } from 'express';
import { z } from 'zod';

import type { ReportService } from '../../../application/report/services/report.service';
import { successResponse } from '../dtos/common/response.dto';

export const generateReportSchema = z
  .object({
    subject: z.enum(['tickets', 'customers']),
    kind: z.enum(['export', 'summary']),
    format: z.enum(['json', 'csv']).default('csv'),
    filters: z
      .object({
        status: z.string().optional(),
        dateFrom: z.string().datetime().optional(),
        dateTo: z.string().datetime().optional(),
      })
      .default({}),
  })
  .superRefine((value, context) => {
    if (value.kind === 'summary' && value.format !== 'json') {
      context.addIssue({
        code: 'custom',
        message: 'Summaries require JSON format',
        path: ['format'],
      });
    }
    const allowed =
      value.subject === 'tickets'
        ? ['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED']
        : ['ACTIVE', 'INACTIVE', 'BLOCKED'];
    if (value.filters.status && !allowed.includes(value.filters.status)) {
      context.addIssue({
        code: 'custom',
        message: 'Invalid status for report subject',
        path: ['filters', 'status'],
      });
    }
    if (
      value.filters.dateFrom &&
      value.filters.dateTo &&
      value.filters.dateFrom > value.filters.dateTo
    ) {
      context.addIssue({
        code: 'custom',
        message: 'dateFrom must precede dateTo',
        path: ['filters', 'dateFrom'],
      });
    }
  });

const listReportsQuerySchema = z.object({
  status: z
    .enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'])
    .optional(),
});

export class ReportController {
  constructor(private readonly reports: ReportService) {}

  async generateReport(req: Request, res: Response): Promise<void> {
    const job = await this.reports.create({
      tenantId: req.tenantId!,
      requesterId: req.user!.id,
      requesterRole: req.user!.role,
      ...(req.body as z.infer<typeof generateReportSchema>),
    });
    res.status(202).json(successResponse(job));
  }

  async list(req: Request, res: Response): Promise<void> {
    const { status } = listReportsQuerySchema.parse(req.query);
    res
      .status(200)
      .json(
        successResponse(await this.reports.list(req.tenantId!, req.user!.id, status)),
      );
  }

  async get(req: Request, res: Response): Promise<void> {
    res
      .status(200)
      .json(
        successResponse(
          await this.reports.get(req.params.id, req.tenantId!, req.user!.id),
        ),
      );
  }

  async cancel(req: Request, res: Response): Promise<void> {
    await this.reports.cancel(req.params.id, req.tenantId!, req.user!.id);
    res.status(204).send();
  }

  async download(req: Request, res: Response): Promise<void> {
    const result = await this.reports.getDownloadUrl(req.params.id, req.tenantId!, {
      id: req.user!.id,
      role: req.user!.role,
    });
    res.status(200).json(successResponse(result));
  }
}
