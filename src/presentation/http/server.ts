import http from 'http';

import type { Application } from 'express';

import { appConfig } from '../../config/app.config';
import { disconnectRedis } from '../../infrastructure/cache/redis.client';
import { disconnectDatabase } from '../../infrastructure/database/prisma.client';
import { closeAllQueues } from '../../infrastructure/queue/queue.factory';
import { WebSocketAuth } from '../../infrastructure/realtime/websocket.auth';
import { WebSocketGateway } from '../../infrastructure/realtime/websocket.gateway';
import { logger } from '../../shared/utils/logger.util';

type ShutdownHook = () => Promise<void>;

export class HttpServer {
  private server: http.Server;
  private wsGateway: WebSocketGateway;
  private isShuttingDown = false;
  private shutdownHook: ShutdownHook | null = null;

  constructor(
    app: Application,
    options: {
      server?: http.Server;
      wsGateway?: WebSocketGateway;
      wsAuth?: WebSocketAuth;
      shutdownHook?: ShutdownHook;
    } = {},
  ) {
    if (options.server) {
      this.server = options.server;
      this.server.removeAllListeners('request');
      this.server.on('request', app);
    } else {
      this.server = http.createServer(app);
    }

    if (options.wsGateway) {
      this.wsGateway = options.wsGateway;
    } else {
      const wsAuth = options.wsAuth ?? new WebSocketAuth();
      this.wsGateway = new WebSocketGateway(this.server, wsAuth);
    }

    this.shutdownHook = options.shutdownHook ?? null;
  }

  getWebSocketGateway(): WebSocketGateway {
    return this.wsGateway;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(appConfig.port, () => {
        logger.info(`OmniSupport API server started`, {
          port: appConfig.port,
          env: appConfig.env,
          pid: process.pid,
        });
        resolve();
      });
    });
  }

  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info('Graceful shutdown initiated...');

    // Stop accepting new connections
    await new Promise<void>((resolve) => {
      this.server.close(() => {
        logger.info('HTTP server closed');
        resolve();
      });
    });

    // Shutdown WebSocket
    await this.wsGateway.shutdown();
    logger.info('WebSocket gateway closed');

    if (this.shutdownHook) {
      await this.shutdownHook();
    }

    // Close queues and workers
    await closeAllQueues();
    logger.info('Job queues closed');

    // Close database
    await disconnectDatabase();
    logger.info('Database disconnected');

    // Close Redis
    await disconnectRedis();
    logger.info('Redis disconnected');

    logger.info('Graceful shutdown complete');
    process.exit(0);
  }

  setupSignalHandlers(): void {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];

    signals.forEach((signal) => {
      process.on(signal, () => {
        logger.info(`Received ${signal}`);
        void this.shutdown();
      });
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error });
      void this.shutdown();
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection', { reason });
      void this.shutdown();
    });
  }
}
