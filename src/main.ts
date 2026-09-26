import 'dotenv/config';
import http from 'http';

import type { TicketAccessService } from './application/ticket/services/ticket-access.service';
import { buildContainer } from './bootstrap/container';
import { startBackgroundProcessing } from './bootstrap/workers';
import { getAppConfig } from './config/app.config';
import { validateStartupConfig } from './config/startup';
import { createRedisClient } from './infrastructure/cache/redis.client';
import { connectDatabase, prisma } from './infrastructure/database/prisma.client';
import {
  bridgeRealtimeToGateway,
  RedisRealtimePublisher,
} from './infrastructure/realtime/realtime-publisher';
import { WebSocketAuth } from './infrastructure/realtime/websocket.auth';
import { WebSocketGateway } from './infrastructure/realtime/websocket.gateway';
import { createApp } from './presentation/http/app';
import { HttpServer } from './presentation/http/server';
import { logger } from './shared/utils/logger.util';

async function bootstrap(): Promise<void> {
  logger.info('Starting OmniSupport Platform...');

  try {
    validateStartupConfig();
    const appConfig = getAppConfig();

    // Connect to database
    await connectDatabase();

    // Connect to Redis
    const redis = await createRedisClient();

    // Prepare a shared HTTP server and WebSocket gateway before building the app container.
    // Ticket rooms follow the same visibility rules as the ticket API.
    let ticketAccess: TicketAccessService | null = null;
    const rawServer = http.createServer();
    const wsGateway = new WebSocketGateway(rawServer, new WebSocketAuth(), {
      allowedOrigins: appConfig.corsOrigins
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
      canAccessTicket: async (user, ticketId) => {
        if (!ticketAccess) return false;
        try {
          await ticketAccess.assertCanAccess(
            {
              id: user.userId,
              email: user.email,
              role: user.role,
              tenantId: user.tenantId,
            },
            ticketId,
          );
          return true;
        } catch {
          return false;
        }
      },
    });

    // Realtime events go through Redis so that every API replica, and events raised by
    // the worker process, reach the right clients.
    const container = await buildContainer(prisma, redis, wsGateway, {
      realtimePublisher: new RedisRealtimePublisher(redis),
    });
    ticketAccess = container.resolve<TicketAccessService>('ticketAccessService');
    const stopRealtimeBridge = await bridgeRealtimeToGateway(redis, wsGateway);

    // Create real HTTP server with full app
    const app = createApp(container);

    // Background processing runs in-process unless RUN_WORKERS=false, in which case a
    // dedicated worker process (`node dist/worker.js`) does it.
    const background =
      appConfig.runWorkers && appConfig.env !== 'test'
        ? startBackgroundProcessing(container, {
            enableTenantPurge: appConfig.enableTenantPurge,
          })
        : null;

    const server = new HttpServer(app, {
      server: rawServer,
      wsGateway,
      shutdownHook: async () => {
        await background?.stop();
        await stopRealtimeBridge();
      },
    });
    server.setupSignalHandlers();

    // Start server
    await server.start();

    logger.info('OmniSupport Platform started successfully', {
      port: appConfig.port,
      env: appConfig.env,
      backgroundProcessing: background !== null,
    });
  } catch (error) {
    logger.error('Failed to start platform', {
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : error,
    });

    process.exit(1);
  }
}

void bootstrap();
