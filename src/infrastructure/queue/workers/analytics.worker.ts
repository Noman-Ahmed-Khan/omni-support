import type { Job, ConnectionOptions } from 'bullmq';
import { Worker } from 'bullmq';

import { logger } from '../../../shared/utils/logger.util';
import { getRedisClient } from '../../cache/redis.client';
import { QueueName } from '../queue.factory';
import type { AnalyticsJobData } from '../queues/analytics.queue';

export function createAnalyticsWorker(
  handler: (data: AnalyticsJobData) => Promise<void>,
): Worker {
  const connection = getRedisClient();

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
      connection: connection as unknown as ConnectionOptions,
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

  return worker;
}
