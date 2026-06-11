import type { Job } from 'bullmq';
import { Worker } from 'bullmq';

import { logger } from '../../../shared/utils/logger.util';
import { getBullMqConnectionOptions, registerWorker, QueueName } from '../queue.factory';
import type { AnalyticsJobData } from '../queues/analytics.queue';

export function createAnalyticsWorker(
  handler: (data: AnalyticsJobData) => Promise<void>,
): Worker {
  const worker = new Worker(
    QueueName.ANALYTICS,
    async (job: Job<AnalyticsJobData>) => {
      logger.info('Processing analytics job', {
        jobId: job.id,
        jobType: job.data.jobType,
        tenantId: job.data.tenantId,
      });

      await handler(job.data);
    },
    {
      connection: getBullMqConnectionOptions(),
      concurrency: 2,
    },
  );

  worker.on('failed', (job, error) => {
    logger.error('Analytics job failed', {
      jobId: job?.id,
      jobType: job?.data?.jobType,
      error: error.message,
    });
  });

  return registerWorker(worker);
}
