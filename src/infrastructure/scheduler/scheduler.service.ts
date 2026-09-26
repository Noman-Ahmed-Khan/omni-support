import type { RedisClientType } from 'redis';

import type { CronJobDefinition, CronRegistry } from './cron.registry';
import { logger } from '../../shared/utils/logger.util';
import type { MetricsService } from '../observability/metrics/metrics.service';

/** Deletes the lock only if it is still owned by this holder. */
const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

/** Extends the lock TTL only if it is still owned by this holder. */
const EXTEND_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
end
return 0
`;

export class SchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private inFlight: Promise<void> | null = null;
  /** Minute (epoch minutes) each job last ran in, so a slow tick can't run a job twice. */
  private readonly lastRunMinute = new Map<string, number>();

  constructor(
    private readonly registry: CronRegistry,
    private readonly redis: RedisClientType,
    private readonly metrics: MetricsService,
    private readonly tickIntervalMs: number = 30_000,
    private readonly lockTtlMs: number = 120_000,
  ) {}

  register(job: CronJobDefinition): void {
    this.registry.register(job);
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    // Ticking more often than once a minute ensures no matching minute is skipped by drift.
    this.timer = setInterval(() => {
      void this.tick();
    }, this.tickIntervalMs);

    void this.tick();
    logger.info('Scheduler started', { intervalMs: this.tickIntervalMs });
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.running = false;

    if (this.inFlight) {
      await this.inFlight;
    }

    logger.info('Scheduler stopped');
  }

  async tick(referenceDate: Date = new Date()): Promise<void> {
    // Never let ticks overlap inside one process.
    if (this.inFlight) {
      return;
    }

    this.inFlight = this.runDueJobs(referenceDate);
    try {
      await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async runDueJobs(referenceDate: Date): Promise<void> {
    const minute = Math.floor(referenceDate.getTime() / 60_000);
    const dueJobs = this.registry.getDueJobs(referenceDate);

    for (const job of dueJobs) {
      if (this.lastRunMinute.get(job.name) === minute) continue;
      this.lastRunMinute.set(job.name, minute);

      try {
        await this.runJob(job, minute);
      } catch (error) {
        logger.error('Scheduler failed to run job', { jobName: job.name, error });
      }
    }
  }

  async runJob(job: CronJobDefinition, minute?: number): Promise<void> {
    // The lock key includes the scheduled minute so each occurrence runs once cluster-wide.
    const baseKey = job.lockKey ?? `scheduler:lock:${job.name}`;
    const lockKey = minute === undefined ? baseKey : `${baseKey}:${minute}`;
    const lockValue = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

    const acquired = await this.redis.set(lockKey, lockValue, {
      NX: true,
      PX: this.lockTtlMs,
    });

    if (!acquired) {
      return;
    }

    // Keep the lock alive while long jobs are running.
    const renew = setInterval(
      () => {
        void this.redis
          .eval(EXTEND_LOCK_SCRIPT, {
            keys: [lockKey],
            arguments: [lockValue, String(this.lockTtlMs)],
          })
          .catch((error: unknown) => {
            logger.warn('Failed to extend scheduler lock', { jobName: job.name, error });
          });
      },
      Math.floor(this.lockTtlMs / 3),
    );
    renew.unref();

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
      clearInterval(renew);
      // Occurrence locks are left to expire so another instance cannot re-run this minute;
      // non-occurrence locks (manual runs) are released atomically.
      if (minute === undefined) {
        await this.redis
          .eval(RELEASE_LOCK_SCRIPT, { keys: [lockKey], arguments: [lockValue] })
          .catch((error: unknown) => {
            logger.warn('Failed to release scheduler lock', { jobName: job.name, error });
          });
      }
    }
  }
}
