import http from 'http';

import type { Application } from 'express';

import { getAppConfig } from '../../config/app.config';
import { disconnectRedis } from '../../infrastructure/cache/redis.client';
import { disconnectDatabase } from '../../infrastructure/database/prisma.client';
import { closeAllQueues } from '../../infrastructure/queue/queue.factory';
import { WebSocketAuth } from '../../infrastructure/realtime/websocket.auth';
import { WebSocketGateway } from '../../infrastructure/realtime/websocket.gateway';
import { logger } from '../../shared/utils/logger.util';

type ShutdownHook = () => Promise<void>;

const SHUTDOWN_TIMEOUT_MS = 25_000;

/**
 * Runs one shutdown step, logging (not throwing) on failure so later steps still run.
 */
async function runShutdownStep(
  name: string,
  step: () => Promise<void>,
): Promise<boolean> {
  try {
    await step();
    logger.info(`${name} closed`);
    return true;
  } catch (error) {
    logger.error(`Failed to close ${name}`, { error });
    return false;
  }
}

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
      this.server.listen(getAppConfig().port, () => {
        logger.info(`OmniSupport API server started`, {
          port: getAppConfig().port,
          env: getAppConfig().env,
          pid: process.pid,
        });
        resolve();
      });
    });
  }

  /**
   * Gracefully stops the process. Every step is attempted even if an earlier one fails,
   * and the whole sequence is bounded by a timeout so the process can never hang.
   */
  async shutdown(exitCode: number = 0): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info('Graceful shutdown initiated...', { exitCode });

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out; forcing exit');
      process.exit(exitCode === 0 ? 1 : exitCode);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    let clean = true;

    // Close WebSocket connections first; upgraded sockets would otherwise keep the HTTP
    // server from finishing its close callback.
    clean =
      (await runShutdownStep('WebSocket gateway', () => this.wsGateway.shutdown())) &&
      clean;

    clean =
      (await runShutdownStep(
        'HTTP server',
        () =>
          new Promise<void>((resolve, reject) => {
            this.server.close((error) => (error ? reject(error) : resolve()));
          }),
      )) && clean;

    if (this.shutdownHook) {
      const hook = this.shutdownHook;
      clean = (await runShutdownStep('Background workers', hook)) && clean;
    }

    clean = (await runShutdownStep('Job queues', closeAllQueues)) && clean;
    clean = (await runShutdownStep('Database', disconnectDatabase)) && clean;
    clean = (await runShutdownStep('Redis', disconnectRedis)) && clean;

    clearTimeout(forceExit);

    const finalExitCode = exitCode !== 0 ? exitCode : clean ? 0 : 1;
    logger.info('Graceful shutdown complete', { exitCode: finalExitCode });
    process.exit(finalExitCode);
  }

  setupSignalHandlers(): void {
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'];

    signals.forEach((signal) => {
      process.on(signal, () => {
        logger.info(`Received ${signal}`);
        void this.shutdown(0);
      });
    });

    // A crash must be reported to the orchestrator with a non-zero exit code.
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error });
      void this.shutdown(1);
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection', { reason });
      void this.shutdown(1);
    });
  }
}
