import type { OutboxProcessor } from './outbox.processor';
import { logger } from '../../shared/utils/logger.util';

export class OutboxWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

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

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.running = false;
    logger.info('Outbox worker stopped');
  }

  async tick(): Promise<void> {
    if (!this.running) {
      return;
    }

    await this.processor.processBatch();
  }
}
