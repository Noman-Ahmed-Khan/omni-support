import type { PrismaClient } from '@prisma/client';
import type { RedisClientType } from 'redis';

import type { MetricsService } from '../metrics/metrics.service';

export interface HealthCheckResult {
  status: 'ok' | 'error';
  latencyMs?: number;
  error?: string;
}

export interface HealthSnapshot {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: Record<string, HealthCheckResult>;
}

export class HealthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: RedisClientType,
    private readonly metrics: MetricsService,
  ) {}

  liveness(): { status: 'ok'; timestamp: string; uptime: number } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  async readiness(): Promise<HealthSnapshot> {
    const checks = await this.runChecks();
    const isReady = Object.values(checks).every((check) => check.status === 'ok');

    return {
      status: isReady ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  async full(): Promise<
    HealthSnapshot & {
      version: string;
      environment?: string;
      uptime: number;
      memory: NodeJS.MemoryUsage;
      websocket?: { connectedClients: number };
      metrics: ReturnType<MetricsService['snapshot']>;
    }
  > {
    const checks = await this.runChecks();
    const isHealthy = Object.values(checks).every((check) => check.status === 'ok');

    return {
      status: isHealthy ? 'ok' : 'unhealthy',
      version: process.env.npm_package_version ?? '1.0.0',
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      checks,
      metrics: this.metrics.snapshot(),
    };
  }

  metricsText(): string {
    return this.metrics.render();
  }

  async runChecks(): Promise<Record<string, HealthCheckResult>> {
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

  private async checkDatabase(): Promise<HealthCheckResult> {
    const start = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - start;
    this.metrics.observeDbCheck('ok', latencyMs);
    return { status: 'ok', latencyMs };
  }

  private async checkRedis(): Promise<HealthCheckResult> {
    const start = Date.now();
    await this.redis.ping();
    const latencyMs = Date.now() - start;
    return { status: 'ok', latencyMs };
  }
}
