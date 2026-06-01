import http from 'http';
import { Application } from 'express';
import { WebSocketGateway } from '../../infrastructure/realtime/websocket.gateway';
import { WebSocketAuth } from '../../infrastructure/realtime/websocket.auth';
import { closeAllQueues } from '../../infrastructure/queue/queue.factory';
import { disconnectDatabase } from '../../infrastructure/database/prisma.client';
import { disconnectRedis } from '../../infrastructure/cache/redis.client';
import { logger } from '../../shared/utils/logger.util';
import { appConfig } from '../../config/app.config';

export class HttpServer {
  private server: http.Server;
  private wsGateway: WebSocketGateway;
  private isShuttingDown = false;

  constructor(app: Application) {
    this.server = http.createServer(app);
    const wsAuth = new WebSocketAuth();
    this.wsGateway = new WebSocketGateway(this.server, wsAuth);
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
    this.server.close(async () => {
      logger.info('HTTP server closed');
    });

    // Shutdown WebSocket
    await this.wsGateway.shutdown();
    logger.info('WebSocket gateway closed');

    // Close queues
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
      process.on(signal, async () => {
        logger.info(`Received ${signal}`);
        await this.shutdown();
      });
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error });
      this.shutdown();
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection', { reason });
      this.shutdown();
    });
  }
}