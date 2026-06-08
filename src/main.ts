import 'dotenv/config';
import http from 'http';

import type { AnalyzeSentimentHandler } from './application/ai/handlers/analyze-sentiment.handler';
import type { CalculateRiskScoreHandler } from './application/ai/handlers/calculate-risk-score.handler';
import type { CategorizeTicketHandler } from './application/ai/handlers/categorize-ticket.handler';
import type { GenerateSummaryHandler } from './application/ai/handlers/generate-summary.handler';
import type { PredictUrgencyHandler } from './application/ai/handlers/predict-urgency.handler';
import type { SuggestResponseHandler } from './application/ai/handlers/suggest-response.handler';
import { createRedisClient } from './infrastructure/cache/redis.client';
import { connectDatabase, prisma } from './infrastructure/database/prisma.client';
import { buildContainer } from './infrastructure/di';
import type { Container } from './infrastructure/di';
import type { SMTPEmailProvider } from './infrastructure/messaging/email/smtp.provider';
import { createAIWorker } from './infrastructure/queue/workers/ai.worker';
import { createEmailWorker } from './infrastructure/queue/workers/email.worker';
import { createNotificationWorker } from './infrastructure/queue/workers/notification.worker';
import { WebSocketAuth } from './infrastructure/realtime/websocket.auth';
import { WebSocketGateway } from './infrastructure/realtime/websocket.gateway';
import { createApp } from './presentation/http/app';
import { HttpServer } from './presentation/http/server';
import { logger } from './shared/utils/logger.util';

async function bootstrap(): Promise<void> {
  logger.info('Starting OmniSupport Platform...');

  try {
    // Connect to database
    await connectDatabase();

    // Connect to Redis
    const redis = await createRedisClient();

    // Prepare a shared HTTP server and WebSocket gateway before building the app container.
    const rawServer = http.createServer();
    const wsGateway = new WebSocketGateway(rawServer, new WebSocketAuth());

    // Build DI container
    const container = await buildContainer(prisma, redis, wsGateway);

    // Create real HTTP server with full app
    const app = createApp(container);
    const server = new HttpServer(app, {
      server: rawServer,
      wsGateway,
    });
    server.setupSignalHandlers();

    // Start background workers (only in non-test mode)
    if (process.env.NODE_ENV !== 'test') {
      startWorkers(container);
    }

    // Start server
    await server.start();

    logger.info('OmniSupport Platform started successfully', {
      port: process.env.PORT ?? 3000,
      env: process.env.NODE_ENV,
    });
  } catch (error) {
    logger.error('Failed to start platform', { error });
    process.exit(1);
  }
}

function startWorkers(container: Container): void {
  const categorizeTicketHandler: CategorizeTicketHandler = container.resolve(
    'categorizeTicketHandler',
  );
  const analyzeSentimentHandler: AnalyzeSentimentHandler = container.resolve(
    'analyzeSentimentHandler',
  );
  const predictUrgencyHandler: PredictUrgencyHandler = container.resolve(
    'predictUrgencyHandler',
  );
  const suggestResponseHandler: SuggestResponseHandler = container.resolve(
    'suggestResponseHandler',
  );
  const generateSummaryHandler: GenerateSummaryHandler = container.resolve(
    'generateSummaryHandler',
  );
  const calculateRiskScoreHandler: CalculateRiskScoreHandler = container.resolve(
    'calculateRiskScoreHandler',
  );
  const emailProvider: SMTPEmailProvider = container.resolve('emailProvider');
  const outboxWorker = container.resolve<{ start(): void }>('outboxWorker');
  const schedulerService = container.resolve<{
    register(job: {
      name: string;
      cronExpression: string;
      handler: () => Promise<void>;
    }): void;
    start(): void;
  }>('schedulerService');
  const analyticsRollupJob = container.resolve<() => Promise<void>>('analyticsRollupJob');
  const ticketEscalationJob =
    container.resolve<() => Promise<void>>('ticketEscalationJob');
  const tenantCleanupJob = container.resolve<() => Promise<void>>('tenantCleanupJob');
  const outboxRetryJob = container.resolve<() => Promise<void>>('outboxRetryJob');

  schedulerService.register({
    name: 'analytics-rollup',
    cronExpression: '0 1 * * *',
    handler: analyticsRollupJob,
  });
  schedulerService.register({
    name: 'ticket-escalation',
    cronExpression: '*/15 * * * *',
    handler: ticketEscalationJob,
  });
  schedulerService.register({
    name: 'tenant-cleanup',
    cronExpression: '30 2 * * *',
    handler: tenantCleanupJob,
  });
  schedulerService.register({
    name: 'outbox-retry',
    cronExpression: '*/5 * * * *',
    handler: outboxRetryJob,
  });

  // AI Worker
  createAIWorker({
    categorize: (data) =>
      categorizeTicketHandler.execute({
        tenantId: data.tenantId,
        ticketId: data.ticketId!,
        content: data.content,
        metadata: data.metadata,
      }),
    sentiment: (data) =>
      analyzeSentimentHandler.execute({
        tenantId: data.tenantId,
        ticketId: data.ticketId!,
        content: data.content,
        metadata: data.metadata,
      }),
    urgency: (data) =>
      predictUrgencyHandler.execute({
        tenantId: data.tenantId,
        ticketId: data.ticketId!,
        content: data.content,
        metadata: data.metadata,
      }),
    'suggest-response': (data) =>
      suggestResponseHandler.execute({
        tenantId: data.tenantId,
        ticketId: data.ticketId!,
        content: data.content,
        metadata: data.metadata,
      }),
    summarize: (data) =>
      generateSummaryHandler.execute({
        tenantId: data.tenantId,
        ticketId: data.ticketId!,
        content: data.content,
        metadata: data.metadata,
      }),
    'risk-score': (data) =>
      calculateRiskScoreHandler.execute({
        tenantId: data.tenantId,
        customerId: data.customerId!,
        content: data.content,
        metadata: data.metadata,
      }),
  });

  // Email Worker
  createEmailWorker(async (data) => {
    await emailProvider.send(data);
  });

  // Notification Worker
  createNotificationWorker((data) => {
    logger.debug('Processing notification', { channel: data.channel });
    return Promise.resolve();
  });

  outboxWorker.start();
  schedulerService.start();

  logger.info('Background workers started');
}

void bootstrap();
