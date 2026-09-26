import type { Container } from './container';
import type { AIService } from '../application/ai/services/ai.service';
import type { SMTPEmailProvider } from '../infrastructure/messaging/email/smtp.provider';
import type { OutboxWorker } from '../infrastructure/outbox/outbox.worker';
import type { AIJobData } from '../infrastructure/queue/queues/ai.queue';
import { createAIWorker } from '../infrastructure/queue/workers/ai.worker';
import { createEmailWorker } from '../infrastructure/queue/workers/email.worker';
import { createNotificationWorker } from '../infrastructure/queue/workers/notification.worker';
import type { SchedulerService } from '../infrastructure/scheduler/scheduler.service';
import { logger } from '../shared/utils/logger.util';

export interface BackgroundProcessing {
  stop(): Promise<void>;
}

export interface BackgroundProcessingOptions {
  /** Registers the destructive tenant purge job. Off unless explicitly enabled. */
  enableTenantPurge: boolean;
}

type ScheduledJob = () => Promise<void>;

/**
 * Starts queue workers, the outbox relay and scheduled jobs for this process.
 */
export function startBackgroundProcessing(
  container: Container,
  options: BackgroundProcessingOptions,
): BackgroundProcessing {
  const aiService = container.resolve<AIService>('aiService');
  const emailProvider = container.resolve<SMTPEmailProvider>('emailProvider');
  const outboxWorker = container.resolve<OutboxWorker>('outboxWorker');
  const schedulerService = container.resolve<SchedulerService>('schedulerService');

  schedulerService.register({
    name: 'analytics-rollup',
    cronExpression: '0 1 * * *',
    handler: container.resolve<ScheduledJob>('analyticsRollupJob'),
  });
  schedulerService.register({
    name: 'ticket-escalation',
    cronExpression: '*/15 * * * *',
    handler: container.resolve<ScheduledJob>('ticketEscalationJob'),
  });

  if (options.enableTenantPurge) {
    logger.warn(
      'Tenant purge job is ENABLED: cancelled tenants will be permanently deleted',
    );
    schedulerService.register({
      name: 'tenant-cleanup',
      cronExpression: '30 2 * * *',
      handler: container.resolve<ScheduledJob>('tenantCleanupJob'),
    });
  }

  const withTicket =
    (process: (data: AIJobData) => Promise<void>) =>
    (data: AIJobData): Promise<void> => {
      if (!data.ticketId) {
        throw new Error(`AI job ${data.jobType} requires a ticketId`);
      }
      return process(data);
    };

  createAIWorker({
    categorize: withTicket((data) => aiService.processCategorizationJob(data)),
    sentiment: withTicket((data) => aiService.processSentimentJob(data)),
    urgency: withTicket((data) => aiService.processUrgencyJob(data)),
    'suggest-response': withTicket((data) => aiService.processSuggestResponseJob(data)),
    summarize: withTicket((data) => aiService.processSummarizeJob(data)),
    'risk-score': (data) => {
      if (!data.customerId) {
        throw new Error('AI job risk-score requires a customerId');
      }
      return aiService.processRiskScoreJob(data);
    },
  });

  createEmailWorker(async (data) => {
    await emailProvider.send(data);
  });

  createNotificationWorker((data) => {
    logger.debug('Processing notification', { channel: data.channel });
    return Promise.resolve();
  });

  outboxWorker.start();
  schedulerService.start();

  logger.info('Background processing started', {
    tenantPurge: options.enableTenantPurge,
  });

  return {
    async stop(): Promise<void> {
      await Promise.all([outboxWorker.stop(), schedulerService.stop()]);
    },
  };
}
