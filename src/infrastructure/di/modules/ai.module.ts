import type { PrismaClient } from '@prisma/client';

import { AnalyzeSentimentHandler } from '../../../application/ai/handlers/analyze-sentiment.handler';
import { CalculateRiskScoreHandler } from '../../../application/ai/handlers/calculate-risk-score.handler';
import { CategorizeTicketHandler } from '../../../application/ai/handlers/categorize-ticket.handler';
import { GenerateSummaryHandler } from '../../../application/ai/handlers/generate-summary.handler';
import { PredictUrgencyHandler } from '../../../application/ai/handlers/predict-urgency.handler';
import { SuggestResponseHandler } from '../../../application/ai/handlers/suggest-response.handler';
import { AIService } from '../../../application/ai/services/ai.service';
import type { CustomerService } from '../../../application/customer/services/customer.service';
import type { FeatureFlagService } from '../../../application/feature-flags/feature-flag.service';
import type { TicketService } from '../../../application/ticket/services/ticket.service';
import type { ITicketRepository } from '../../../domain/ticket/repositories/ticket.repository.interface';
import { AIController } from '../../../presentation/http/controllers/ai.controller';
import { AIProviderFactory } from '../../ai/ai-provider.factory';
import type { ActivityRepository } from '../../database/repositories/activity.repository';
import type { WebSocketGateway } from '../../realtime/websocket.gateway';
import type { Container } from '../index';

export function registerAIModule(container: Container): void {
  const prisma = container.resolve<PrismaClient>('prisma');
  const ticketRepo = container.resolve<ITicketRepository>('ticketRepo');
  const customerService = container.resolve<CustomerService>('customerService');
  const ticketService = container.resolve<TicketService>('ticketService');
  const activityRepo = container.resolve<ActivityRepository>('activityRepo');
  const wsGateway = container.resolve<WebSocketGateway>('wsGateway');
  const featureFlagService = container.resolve<FeatureFlagService>('featureFlagService');

  const aiProvider = AIProviderFactory.create();
  container.register('aiProvider', aiProvider);

  const aiService = new AIService(
    aiProvider,
    prisma,
    ticketRepo,
    customerService,
    ticketService,
    activityRepo,
    wsGateway,
    featureFlagService,
  );
  container.register('aiService', aiService);

  // Note: aiWorker initialization should be handled in a dedicated workers startup script.

  container.register('categorizeTicketHandler', new CategorizeTicketHandler(aiService));
  container.register('analyzeSentimentHandler', new AnalyzeSentimentHandler(aiService));
  container.register('predictUrgencyHandler', new PredictUrgencyHandler(aiService));
  container.register('suggestResponseHandler', new SuggestResponseHandler(aiService));
  container.register('generateSummaryHandler', new GenerateSummaryHandler(aiService));
  container.register(
    'calculateRiskScoreHandler',
    new CalculateRiskScoreHandler(aiService),
  );

  container.register(
    'aiController',
    new AIController(
      aiService,
      container.resolve('categorizeTicketHandler'),
      container.resolve('analyzeSentimentHandler'),
      container.resolve('predictUrgencyHandler'),
      container.resolve('suggestResponseHandler'),
      container.resolve('generateSummaryHandler'),
      container.resolve('calculateRiskScoreHandler'),
    ),
  );
}
