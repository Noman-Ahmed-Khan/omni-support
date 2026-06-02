import { Queue } from 'bullmq';
import { createQueue, QueueName } from '../queue.factory';

export interface NotificationJobData {
  notificationId: string;
  tenantId: string;
  userId?: string;
  customerId?: string;
  channel: string;
  subject?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export class NotificationQueue {
  private readonly queue: Queue;

  constructor() {
    this.queue = createQueue(QueueName.NOTIFICATIONS);
  }

  async add(data: NotificationJobData, priority?: number): Promise<void> {
    await this.queue.add('send-notification', data, {
      priority: priority ?? 5,
      jobId: `notification:${data.notificationId}`,
    });
  }

  async addBulk(notifications: NotificationJobData[]): Promise<void> {
    const jobs = notifications.map((data) => ({
      name: 'send-notification',
      data,
      opts: { priority: 5 },
    }));

    await this.queue.addBulk(jobs);
  }
}
