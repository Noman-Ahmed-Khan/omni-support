import type { RedisClientType, RedisClientOptions } from 'redis';
import { createClient } from 'redis';

import { redisConfig } from '../../config/redis.config';
import { logger } from '../../shared/utils/logger.util';

let redisClient: RedisClientType | null = null;
let redisClientPromise: Promise<RedisClientType> | null = null;
let redisDisconnectPromise: Promise<void> | null = null;

function getRedisClientOptions(): RedisClientOptions {
  if (redisConfig.url) {
    return {
      url: redisConfig.url,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('Redis max reconnection attempts reached');
            return new Error('Redis max retries exceeded');
          }
          return Math.min(retries * 100, 3000);
        },
      },
    };
  }

  return {
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
  };
}

export async function createRedisClient(): Promise<RedisClientType> {
  if (redisClient) {
    return redisClient;
  }

  if (redisClientPromise) {
    return redisClientPromise;
  }

  redisClientPromise = (async () => {
    const client = createClient(getRedisClientOptions()) as RedisClientType;

    client.on('connect', () => logger.info('Redis connecting...'));
    client.on('ready', () => logger.info('Redis connected and ready'));
    client.on('error', (err: unknown) => logger.error('Redis error', { err }));
    client.on('reconnecting', () => logger.warn('Redis reconnecting...'));
    client.on('end', () => logger.warn('Redis connection ended'));

    try {
      await client.connect();
    } catch (error) {
      redisClientPromise = null;
      throw error;
    }

    redisClient = client;
    redisClientPromise = null;

    return client;
  })();

  return redisClientPromise;
}

export function getRedisClient(): RedisClientType {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call createRedisClient() first.');
  }
  return redisClient;
}

export async function disconnectRedis(): Promise<void> {
  if (redisDisconnectPromise) {
    return redisDisconnectPromise;
  }

  redisDisconnectPromise = (async () => {
    if (redisClientPromise && !redisClient) {
      try {
        const client = await redisClientPromise;
        if (client.isOpen) {
          await client.quit();
        }
      } catch (error) {
        logger.warn('Redis disconnect during pending connection failed', { error });
      }
      redisClientPromise = null;
      return;
    }

    if (!redisClient) {
      return;
    }

    if (!redisClient.isOpen) {
      logger.warn('Redis client already closed before disconnect');
      redisClient = null;
      return;
    }

    try {
      await redisClient.quit();
    } catch (error) {
      logger.warn('Redis quit failed or was already closed', { error });
    }
    logger.info('Redis disconnected');
    redisClient = null;
  })().finally(() => {
    redisDisconnectPromise = null;
  });

  return redisDisconnectPromise;
}
