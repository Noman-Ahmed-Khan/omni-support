import type { Job, ConnectionOptions } from 'bullmq';
import { Worker } from 'bullmq';

import { logger } from '../../../shared/utils/logger.util';
import { getRedisClient } from '../../cache/redis.client';
import { QueueName } from '../queue.factory';
import type { NotificationJobData } from '../queues/notification.queue';

export function createNotificationWorker(
  handler: (data: NotificationJobData) => Promise<void>,
): Worker {
  const connection = getRedisClient();

  const worker = new Worker(
    QueueName.NOTIFICATIONS,
    async (job: Job<NotificationJobData>) => {
      logger.info('Processing notification', {
        jobId: job.id,
        channel: job.data.channel,
        tenantId: job.data.tenantId,
      });

      await handler(job.data);
    },
    {
      connection: connection as unknown as ConnectionOptions,
      concurrency: 20,
    },
  );

  worker.on('failed', (job, error) => {
    logger.error('Notification job failed', {
      jobId: job?.id,
      channel: job?.data?.channel,
      error: error.message,
    });
  });

  return worker;
}
