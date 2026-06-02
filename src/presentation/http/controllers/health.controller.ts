import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { RedisClientType } from 'redis';
import { WebSocketGateway } from '../../../infrastructure/realtime/websocket.gateway';

interface HealthCheck {
  status: 'ok' | 'error';
  latencyMs?: number;
  error?: string;
}

export class HealthController {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: RedisClientType,
    private readonly wsGateway: WebSocketGateway,
  ) {}

  liveness(_req: Request, res: Response): void {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      pid: process.pid,
    });
  }

  async readiness(_req: Request, res: Response): Promise<void> {
    const checks = await this.runChecks();

    const isReady = Object.values(checks).every(
      (check) => check.status === 'ok',
    );

    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    });
  }

  async full(_req: Request, res: Response): Promise<void> {
    const checks = await this.runChecks();
    const isHealthy = Object.values(checks).every(
      (check) => check.status === 'ok',
    );

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      version: process.env.npm_package_version ?? '1.0.0',
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      checks,
      websocket: {
        connectedClients: this.wsGateway.getConnectedCount(),
      },
    });
  }

  private async runChecks(): Promise<Record<string, HealthCheck>> {
    const [dbCheck, redisCheck] = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    return {
      database:
        dbCheck.status === 'fulfilled'
          ? dbCheck.value
          : { status: 'error', error: 'Database unreachable' },
      redis:
        redisCheck.status === 'fulfilled'
          ? redisCheck.value
          : { status: 'error', error: 'Redis unreachable' },
    };
  }

  private async checkDatabase(): Promise<HealthCheck> {
    const start = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', latencyMs: Date.now() - start };
  }

  private async checkRedis(): Promise<HealthCheck> {
    const start = Date.now();
    await this.redis.ping();
    return { status: 'ok', latencyMs: Date.now() - start };
  }
}
