import type { PrismaClient } from '@prisma/client';

import type { Container } from '..';
import { AIService } from '../../../application/ai/services/ai.service';
import type { CustomerService } from '../../../application/customer/services/customer.service';
import type { FeatureFlagService } from '../../../application/feature-flags/feature-flag.service';
import type { TicketAccessService } from '../../../application/ticket/services/ticket-access.service';
import type { TicketService } from '../../../application/ticket/services/ticket.service';
import type { ITicketRepository } from '../../../domain/ticket/repositories/ticket.repository.interface';
import { AIProviderFactory } from '../../../infrastructure/ai/ai-provider.factory';
import type { ActivityRepository } from '../../../infrastructure/database/repositories/activity.repository';
import type { AIQueue } from '../../../infrastructure/queue/queues/ai.queue';
import type { RealtimePublisher } from '../../../infrastructure/realtime/realtime-publisher';
import { AIController } from '../../../presentation/http/controllers/ai.controller';

export function registerAIModule(container: Container): void {
  const prisma = container.resolve<PrismaClient>('prisma');
  const ticketRepo = container.resolve<ITicketRepository>('ticketRepo');
  const customerService = container.resolve<CustomerService>('customerService');
  const ticketService = container.resolve<TicketService>('ticketService');
  const activityRepo = container.resolve<ActivityRepository>('activityRepo');
  const wsGateway = container.resolve<RealtimePublisher>('realtimePublisher');
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

  container.register(
    'aiController',
    new AIController(
      aiService,
      container.resolve<AIQueue>('aiQueue'),
      container.resolve<TicketAccessService>('ticketAccessService'),
      customerService,
    ),
  );
}
