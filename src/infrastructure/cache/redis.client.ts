import type { RedisClientType } from 'redis';
import { createClient } from 'redis';

import { redisConfig } from '../../config/redis.config';
import { logger } from '../../shared/utils/logger.util';

let redisClient: RedisClientType;

export async function createRedisClient(): Promise<RedisClientType> {
  const client = createClient({
    socket: {
      host: redisConfig.host,
      port: redisConfig.port,
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          logger.error('Redis max reconnection attempts reached');
          return new Error('Redis max retries exceeded');
        }
        return Math.min(retries * 100, 3000);
      },
    },
    password: redisConfig.password,
    database: redisConfig.db,
  }) as RedisClientType;

  client.on('connect', () => logger.info('Redis connecting...'));
  client.on('ready', () => logger.info('Redis connected and ready'));
  client.on('error', (err: unknown) => logger.error('Redis error', { err }));
  client.on('reconnecting', () => logger.warn('Redis reconnecting...'));
  client.on('end', () => logger.warn('Redis connection ended'));

  await client.connect();
  redisClient = client;

  return client;
}

export function getRedisClient(): RedisClientType {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call createRedisClient() first.');
  }
  return redisClient;
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    logger.info('Redis disconnected');
  }
}
