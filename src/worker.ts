import 'dotenv/config';
import http from 'http';

import { buildContainer } from './bootstrap/container';
import { startBackgroundProcessing } from './bootstrap/workers';
import { getAppConfig } from './config/app.config';
import { validateStartupConfig } from './config/startup';
import { createRedisClient, disconnectRedis } from './infrastructure/cache/redis.client';
import {
  connectDatabase,
  disconnectDatabase,
  prisma,
} from './infrastructure/database/prisma.client';
import { closeAllQueues } from './infrastructure/queue/queue.factory';
import { RedisRealtimePublisher } from './infrastructure/realtime/realtime-publisher';
import { WebSocketAuth } from './infrastructure/realtime/websocket.auth';
import { WebSocketGateway } from './infrastructure/realtime/websocket.gateway';
import { logger } from './shared/utils/logger.util';

const SHUTDOWN_TIMEOUT_MS = 25_000;

/**
 * Dedicated background-processing process (queue workers, outbox relay, scheduled jobs).
 * Realtime events it raises are published to Redis and delivered by the API processes.
 */
async function bootstrap(): Promise<void> {
  logger.info('Starting OmniSupport worker...');

  validateStartupConfig();
  const appConfig = getAppConfig();

  await connectDatabase();
  const redis = await createRedisClient();

  // This process serves no WebSocket clients: realtime events are published to Redis and
  // delivered by the API processes. The gateway only satisfies the container's wiring.
  const detachedServer = http.createServer();
  const wsGateway = new WebSocketGateway(detachedServer, new WebSocketAuth());

  const container = await buildContainer(prisma, redis, wsGateway, {
    realtimePublisher: new RedisRealtimePublisher(redis),
  });
  const background = startBackgroundProcessing(container, {
    enableTenantPurge: appConfig.enableTenantPurge,
  });

  let shuttingDown = false;

  const shutdown = async (exitCode: number): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    const forceExit = setTimeout(() => process.exit(exitCode || 1), SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    const steps: Array<[string, () => Promise<void>]> = [
      ['background processing', () => background.stop()],
      ['job queues', closeAllQueues],
      ['websocket gateway', () => wsGateway.shutdown()],
      ['database', disconnectDatabase],
      ['redis', disconnectRedis],
    ];

    let clean = true;
    for (const [name, step] of steps) {
      try {
        await step();
      } catch (error) {
        clean = false;
        logger.error(`Failed to close ${name}`, { error });
      }
    }

    clearTimeout(forceExit);
    process.exit(exitCode !== 0 ? exitCode : clean ? 0 : 1);
  };

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      logger.info(`Worker received ${signal}`);
      void shutdown(0);
    });
  }

  process.on('uncaughtException', (error) => {
    logger.error('Worker uncaught exception', { error });
    void shutdown(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Worker unhandled rejection', { reason });
    void shutdown(1);
  });

  logger.info('OmniSupport worker started');
}

bootstrap().catch((error: unknown) => {
  logger.error('Failed to start worker', {
    error:
      error instanceof Error ? { message: error.message, stack: error.stack } : error,
  });
  process.exit(1);
});
