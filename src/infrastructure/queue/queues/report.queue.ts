import type { Queue } from 'bullmq';

import { createQueue, QueueName } from '../queue.factory';

export type ReportJobType = 'summary' | 'export' | 'snapshot';

export interface ReportJobData {
  tenantId: string;
  jobType: ReportJobType;
  requestedById?: string;
  format?: 'json' | 'csv';
  filters?: Record<string, unknown>;
}

export class ReportQueue {
  private readonly queue: Queue;

  constructor() {
    this.queue = createQueue(QueueName.REPORTS);
  }

  async add(data: ReportJobData, priority: number = 5): Promise<void> {
    await this.queue.add(`report:${data.jobType}`, data, {
      priority,
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
    });
  }
}
