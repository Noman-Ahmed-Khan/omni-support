import type { OutboxProcessor } from './outbox.processor';
import { logger } from '../../shared/utils/logger.util';

export class OutboxWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly processor: OutboxProcessor,
    private readonly intervalMs: number = 5000,
  ) {}

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);

    logger.info('Outbox worker started', { intervalMs: this.intervalMs });
  }

  /** Stops polling and waits for the batch currently being processed, if any. */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.running = false;

    if (this.inFlight) {
      await this.inFlight;
    }

    logger.info('Outbox worker stopped');
  }

  async tick(): Promise<void> {
    // Never run overlapping batches from the same worker.
    if (!this.running || this.inFlight) {
      return;
    }

    this.inFlight = (async () => {
      try {
        await this.processor.processBatch();
      } catch (error) {
        logger.error('Outbox batch failed', { error });
      }
    })();

    try {
      await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }
}
