import { RedisClientType } from 'redis';
import { MetricsService } from '../observability/metrics/metrics.service';
import { logger } from '../../shared/utils/logger.util';
import { CronJobDefinition, CronRegistry } from './cron.registry';

export class SchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly registry: CronRegistry,
    private readonly redis: RedisClientType,
    private readonly metrics: MetricsService,
    private readonly tickIntervalMs: number = 60_000,
  ) {}

  register(job: CronJobDefinition): void {
    this.registry.register(job);
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.tickIntervalMs);

    void this.tick();
    logger.info('Scheduler started', { intervalMs: this.tickIntervalMs });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.running = false;
    logger.info('Scheduler stopped');
  }

  async tick(referenceDate: Date = new Date()): Promise<void> {
    const dueJobs = this.registry.getDueJobs(referenceDate);

    for (const job of dueJobs) {
      await this.runJob(job);
    }
  }

  async runJob(job: CronJobDefinition): Promise<void> {
    const lockKey = job.lockKey ?? `scheduler:lock:${job.name}`;
    const lockValue = `${process.pid}:${Date.now()}`;
    const lockTtlMs = Math.max(this.tickIntervalMs * 2, 60_000);

    const acquired = await this.redis.set(lockKey, lockValue, {
      NX: true,
      PX: lockTtlMs,
    });

    if (!acquired) {
      return;
    }

    const start = Date.now();

    try {
      await job.handler();
      this.metrics.observeWorkerRun(job.name, 'ok', Date.now() - start);
    } catch (error) {
      this.metrics.observeWorkerRun(job.name, 'error', Date.now() - start);
      logger.error('Scheduled job failed', {
        jobName: job.name,
        error,
      });
    } finally {
      const currentLockValue = await this.redis.get(lockKey);
      if (currentLockValue === lockValue) {
        await this.redis.del(lockKey);
      }
    }
  }
}
