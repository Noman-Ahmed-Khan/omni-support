import type { Queue } from 'bullmq';

import { createQueue, QueueName } from '../queue.factory';

export interface WhatsAppJobData {
  to: string;
  body: string;
  mediaUrl?: string;
  templateName?: string;
  templateParams?: string[];
  metadata?: Record<string, unknown>;
}

export class WhatsAppQueue {
  private readonly queue: Queue;

  constructor() {
    this.queue = createQueue(QueueName.WHATSAPP);
  }

  async add(data: WhatsAppJobData, priority: number = 5): Promise<void> {
    await this.queue.add('send-whatsapp', data, {
      priority,
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
    });
  }

  async addBulk(messages: WhatsAppJobData[]): Promise<void> {
    const jobs = messages.map((data) => ({
      name: 'send-whatsapp',
      data,
      opts: { priority: 5 },
    }));

    await this.queue.addBulk(jobs);
  }
}
