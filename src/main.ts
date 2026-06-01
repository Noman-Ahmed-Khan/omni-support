import 'dotenv/config';
import { connectDatabase, prisma } from './infrastructure/database/prisma.client';
import { createRedisClient } from './infrastructure/cache/redis.client';
import { HttpServer } from './presentation/http/server';
import { createApp } from './presentation/http/app';
import { buildContainer } from './container';
import { createAIWorker } from './infrastructure/queue/workers/ai.worker';
import { createEmailWorker } from './infrastructure/queue/workers/email.worker';
import { createNotificationWorker } from './infrastructure/queue/workers/notification.worker';
import { CategorizeTicketHandler } from './application/ai/handlers/categorize-ticket.handler';
import { AnalyzeSentimentHandler } from './application/ai/handlers/analyze-sentiment.handler';
import { PredictUrgencyHandler } from './application/ai/handlers/predict-urgency.handler';
import { SuggestResponseHandler } from './application/ai/handlers/suggest-response.handler';
import { GenerateSummaryHandler } from './application/ai/handlers/generate-summary.handler';
import { CalculateRiskScoreHandler } from './application/ai/handlers/calculate-risk-score.handler';
import { SMTPEmailProvider } from './infrastructure/messaging/email/smtp.provider';
import { logger } from './shared/utils/logger.util';

async function bootstrap() {
  logger.info('Starting OmniSupport Platform...');

  try {
    // Connect to database
    await connectDatabase();

    // Connect to Redis
    const redis = await createRedisClient();

    // Create HTTP server (temporary - to get wsGateway for container)
    const tempServer = new HttpServer(createApp({}));
    const wsGateway = tempServer.getWebSocketGateway();

    // Build DI container
    const container = await buildContainer(prisma, redis, wsGateway);

    // Create real HTTP server with full app
    const app = createApp(container);
    const server = new HttpServer(app);
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

function startWorkers(container: any): void {
  const categorizeTicketHandler: CategorizeTicketHandler = container.resolve('categorizeTicketHandler');
  const analyzeSentimentHandler: AnalyzeSentimentHandler = container.resolve('analyzeSentimentHandler');
  const predictUrgencyHandler: PredictUrgencyHandler = container.resolve('predictUrgencyHandler');
  const suggestResponseHandler: SuggestResponseHandler = container.resolve('suggestResponseHandler');
  const generateSummaryHandler: GenerateSummaryHandler = container.resolve('generateSummaryHandler');
  const calculateRiskScoreHandler: CalculateRiskScoreHandler = container.resolve('calculateRiskScoreHandler');
  const emailProvider: SMTPEmailProvider = container.resolve('emailProvider');
  // AI Worker
  createAIWorker({
    categorize: (data) => categorizeTicketHandler.execute({
      tenantId: data.tenantId,
      ticketId: data.ticketId!,
      content: data.content,
      metadata: data.metadata,
    }),
    sentiment: (data) => analyzeSentimentHandler.execute({
      tenantId: data.tenantId,
      ticketId: data.ticketId!,
      content: data.content,
      metadata: data.metadata,
    }),
    urgency: (data) => predictUrgencyHandler.execute({
      tenantId: data.tenantId,
      ticketId: data.ticketId!,
      content: data.content,
      metadata: data.metadata,
    }),
    'suggest-response': (data) => suggestResponseHandler.execute({
      tenantId: data.tenantId,
      ticketId: data.ticketId!,
      content: data.content,
      metadata: data.metadata,
    }),
    summarize: (data) => generateSummaryHandler.execute({
      tenantId: data.tenantId,
      ticketId: data.ticketId!,
      content: data.content,
      metadata: data.metadata,
    }),
    'risk-score': (data) => calculateRiskScoreHandler.execute({
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
  createNotificationWorker(async (data) => {
    logger.debug('Processing notification', { channel: data.channel });
    // Route to appropriate channel
  });

  logger.info('Background workers started');
}

bootstrap();
