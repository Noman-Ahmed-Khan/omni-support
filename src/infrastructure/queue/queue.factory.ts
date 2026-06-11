import type { QueueOptions, QueueEvents, Worker } from 'bullmq';
import { Queue } from 'bullmq';

import { getRedisConfig } from '../../config/redis.config';
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
const workers = new Set<Worker>();
const queueEvents = new Set<QueueEvents>();

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

export function getBullMqConnectionOptions(): {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
} {
  const redisConfig = getRedisConfig();
  const opts: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
  } = {};

  if (redisConfig.host) opts.host = redisConfig.host;
  if (typeof redisConfig.port === 'number') opts.port = redisConfig.port;
  if (redisConfig.password) opts.password = redisConfig.password;
  if (typeof redisConfig.db === 'number') opts.db = redisConfig.db;

  return opts;
}

export function createQueue(name: QueueName): Queue {
  if (queues.has(name)) {
    return queues.get(name)!;
  }

  const queue = new Queue(name, {
    ...defaultQueueOptions,
    connection: getBullMqConnectionOptions(),
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

export function registerWorker(worker: Worker): Worker {
  worker.on('error', (error) => {
    logger.error('BullMQ worker error', { error });
  });

  workers.add(worker);
  return worker;
}
export function registerQueueEvents(events: QueueEvents): QueueEvents {
  queueEvents.add(events);
  return events;
}

async function closeResources<T extends { close(): Promise<void> }>(
  resources: Iterable<T>,
  clear: () => void,
): Promise<Error[]> {
  const results = await Promise.allSettled(
    Array.from(resources, (resource) => resource.close()),
  );

  clear();

  return results
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) =>
      result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
    );
}

export async function closeAllQueues(): Promise<void> {
  const errors: Error[] = [];

  errors.push(...(await closeResources(workers, () => workers.clear())));
  errors.push(...(await closeResources(queueEvents, () => queueEvents.clear())));
  errors.push(...(await closeResources(queues.values(), () => queues.clear())));

  if (errors.length > 0) {
    logger.error('One or more BullMQ resources failed to close', { errors });
    throw new AggregateError(errors, 'Failed to close BullMQ resources');
  }

  logger.info('All queues closed');
}
