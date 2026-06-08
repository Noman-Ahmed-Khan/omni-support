import type { Queue } from 'bullmq';

import { createQueue, QueueName } from '../queue.factory';

export type AnalyticsJobType = 'dashboard-rollup' | 'trend-refresh' | 'snapshot';

export interface AnalyticsJobData {
  tenantId: string;
  jobType: AnalyticsJobType;
  metadata?: Record<string, unknown>;
}

export class AnalyticsQueue {
  private readonly queue: Queue;

  constructor() {
    this.queue = createQueue(QueueName.ANALYTICS);
  }

  async add(data: AnalyticsJobData, priority: number = 5): Promise<void> {
    await this.queue.add(`analytics:${data.jobType}`, data, {
      priority,
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
    });
  }

  async addBulk(jobs: AnalyticsJobData[]): Promise<void> {
    await this.queue.addBulk(
      jobs.map((data) => ({
        name: `analytics:${data.jobType}`,
        data,
        opts: { priority: 5 },
      })),
    );
  }
}
