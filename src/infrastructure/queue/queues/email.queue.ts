import { Queue } from 'bullmq';
import { createQueue, QueueName } from '../queue.factory';

export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    path: string;
    contentType: string;
  }>;
  metadata?: Record<string, unknown>;
}

export class EmailQueue {
  private readonly queue: Queue;

  constructor() {
    this.queue = createQueue(QueueName.EMAIL);
  }

  async add(data: EmailJobData, priority: number = 5): Promise<void> {
    await this.queue.add('send-email', data, {
      priority,
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
    });
  }

  // High priority for password reset and verification
  async addUrgent(data: EmailJobData): Promise<void> {
    return this.add(data, 1);
  }
}
