import { Queue } from 'bullmq';
import { createQueue, QueueName } from '../queue.factory';

export type AIJobType =
  | 'categorize'
  | 'sentiment'
  | 'urgency'
  | 'suggest-response'
  | 'summarize'
  | 'risk-score';

export interface AIJobData {
  jobType: AIJobType;
  tenantId: string;
  ticketId?: string;
  customerId?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export class AIQueue {
  private readonly queue: Queue;

  constructor() {
    this.queue = createQueue(QueueName.AI_PROCESSING);
  }

  async add(data: AIJobData): Promise<void> {
    await this.queue.add(`ai:${data.jobType}`, data, {
      priority: data.jobType === 'urgency' ? 1 : 5, // Urgency is higher priority
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }

  async addTicketAnalysis(
    ticketId: string,
    tenantId: string,
    content: string,
  ): Promise<void> {
    // Queue all AI jobs for a new ticket
    const jobs: AIJobData[] = [
      { jobType: 'categorize', tenantId, ticketId, content },
      { jobType: 'sentiment', tenantId, ticketId, content },
      { jobType: 'urgency', tenantId, ticketId, content },
    ];

    const bullJobs = jobs.map((data) => ({
      name: `ai:${data.jobType}`,
      data,
      opts: {
        priority: data.jobType === 'urgency' ? 1 : 5,
        attempts: 2,
      },
    }));

    await this.queue.addBulk(bullJobs);
  }
}