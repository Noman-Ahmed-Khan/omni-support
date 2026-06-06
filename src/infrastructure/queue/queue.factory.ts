import { ConnectionOptions, Queue, QueueOptions } from 'bullmq';
import { getRedisClient } from '../cache/redis.client';
import { logger } from '../../shared/utils/logger.util';

export enum QueueName {
  NOTIFICATIONS = 'notifications',
  EMAIL = 'email',
  WHATSAPP = 'whatsapp',
  AI_PROCESSING = 'ai-processing',
  ANALYTICS = 'analytics',
  REPORTS = 'reports',
  WEBHOOKS = 'webhooks',
}

const queues = new Map<string, Queue>();

const defaultQueueOptions: Omit<QueueOptions, 'connection'> = {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
};

const skipRedisQueues = process.env.SKIP_REDIS === 'true';

export function createQueue(name: QueueName): Queue {
  if (queues.has(name)) {
    return queues.get(name)!;
  }

  if (skipRedisQueues) {
    const queue = {
      add: () => undefined,
      addBulk: () => undefined,
      on: () => undefined,
      close: () => undefined,
    } as unknown as Queue;

    queues.set(name, queue);
    logger.info(`Queue ${name} created (stubbed)`);

    return queue;
  }

  const connection = getRedisClient();

  const queue = new Queue(name, {
    ...defaultQueueOptions,
    connection: connection as unknown as ConnectionOptions,
  });

  queue.on('error', (error) => {
    logger.error(`Queue ${name} error`, { error });
  });

  queues.set(name, queue);
  logger.info(`Queue ${name} created`);

  return queue;
}

export function getQueue(name: QueueName): Queue {
  const queue = queues.get(name);
  if (!queue) {
    return createQueue(name);
  }
  return queue;
}

export async function closeAllQueues(): Promise<void> {
  const closePromises = Array.from(queues.values()).map((q) => q.close());
  await Promise.all(closePromises);
  logger.info('All queues closed');
}
