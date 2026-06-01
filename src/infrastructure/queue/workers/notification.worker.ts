import { Worker, Job } from 'bullmq';
import { getRedisClient } from '../../cache/redis.client';
import { QueueName } from '../queue.factory';
import { NotificationJobData } from '../queues/notification.queue';
import { logger } from '../../../shared/utils/logger.util';

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
      connection: connection as any,
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