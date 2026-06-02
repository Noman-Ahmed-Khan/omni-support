import { Worker, Job, ConnectionOptions } from 'bullmq';
import { getRedisClient } from '../../cache/redis.client';
import { QueueName } from '../queue.factory';
import { AIJobData } from '../queues/ai.queue';
import { logger } from '../../../shared/utils/logger.util';

export function createAIWorker(
  handlers: {
    categorize: (data: AIJobData) => Promise<void>;
    sentiment: (data: AIJobData) => Promise<void>;
    urgency: (data: AIJobData) => Promise<void>;
    'suggest-response': (data: AIJobData) => Promise<void>;
    summarize: (data: AIJobData) => Promise<void>;
    'risk-score': (data: AIJobData) => Promise<void>;
  },
): Worker {
  const connection = getRedisClient();

  const worker = new Worker(
    QueueName.AI_PROCESSING,
    async (job: Job<AIJobData>) => {
      const { jobType } = job.data;

      logger.info('Processing AI job', {
        jobId: job.id,
        jobType,
        tenantId: job.data.tenantId,
        ticketId: job.data.ticketId,
      });

      const handler = handlers[jobType as keyof typeof handlers];

      if (!handler) {
        throw new Error(`No handler for AI job type: ${jobType}`);
      }

      await handler(job.data);

      logger.info('AI job completed', { jobId: job.id, jobType });
    },
    {
      connection: connection as unknown as ConnectionOptions,
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 1000, // 10 AI calls per second max
      },
    },
  );

  worker.on('failed', (job, error) => {
    logger.error('AI job failed', {
      jobId: job?.id,
      jobType: job?.data?.jobType,
      error: error.message,
      attempts: job?.attemptsMade,
    });
  });

  worker.on('completed', (job) => {
    logger.debug('AI job completed successfully', { jobId: job.id });
  });

  return worker;
}
