import type { PrismaClient } from '@prisma/client';
import type { RedisClientType } from 'redis';

import { registerAIModule } from './modules/ai.module';
import { registerAttachmentModule } from './modules/attachment.module';
import { registerAuthModule } from './modules/auth.module';
import { registerMessagingModule } from './modules/messaging.module';
import { registerNotificationModule } from './modules/notification.module';
import { registerReportModule } from './modules/report.module';
import { registerTenantModule } from './modules/tenant.module';
import { registerTicketModule } from './modules/ticket.module';
import { AnalyticsService } from '../../application/analytics/services/analytics.service';
import { AuditService } from '../../application/audit/services/audit.service';
import { TokenService } from '../../application/auth/services/token.service';
import { CreateCustomerHandler } from '../../application/customer/handlers/create-customer.handler';
import { CustomerTimelineHandler } from '../../application/customer/handlers/customer-timeline.handler';
import { DeleteCustomerHandler } from '../../application/customer/handlers/delete-customer.handler';
import { GetCustomerHandler } from '../../application/customer/handlers/get-customer.handler';
import { ListCustomersHandler } from '../../application/customer/handlers/list-customers.handler';
import { TriggerRiskScoreHandler } from '../../application/customer/handlers/trigger-risk-score.handler';
import { UpdateCustomerHandler } from '../../application/customer/handlers/update-customer.handler';
import { CustomerService } from '../../application/customer/services/customer.service';
import { InProcessEventBus } from '../../application/event-bus/event-bus';
import type {
  EventHandler,
  IEventBus,
} from '../../application/event-bus/event-bus.interface';
import { FeatureFlagService } from '../../application/feature-flags/feature-flag.service';
import { NotificationService } from '../../application/notification/services/notification.service';
import { SearchService } from '../../application/search/services/search.service';
import { UserService } from '../../application/user/services/user.service';
import { getStorageConfig } from '../../config/storage.config';
import type { INotificationRepository } from '../../domain/notification/repositories/notification.repository.interface';
import type { ITenantRepository } from '../../domain/tenant/repositories/tenant.repository.interface';
import type { CommentAddedEvent } from '../../domain/ticket/events/comment-added.event';
import type { TicketAssignedEvent } from '../../domain/ticket/events/ticket-assigned.event';
import type { TicketCreatedEvent } from '../../domain/ticket/events/ticket-created.event';
import type { TicketEscalatedEvent } from '../../domain/ticket/events/ticket-escalated.event';
import type { TicketResolvedEvent } from '../../domain/ticket/events/ticket-resolved.event';
import type { ITicketRepository } from '../../domain/ticket/repositories/ticket.repository.interface';
import { AnalyticsController } from '../../presentation/http/controllers/analytics.controller';
import { CustomerController } from '../../presentation/http/controllers/customer.controller';
import { DashboardController } from '../../presentation/http/controllers/dashboard.controller';
import { HealthController } from '../../presentation/http/controllers/health.controller';
import { SearchController } from '../../presentation/http/controllers/search.controller';
import { UserController } from '../../presentation/http/controllers/user.controller';
import { logger } from '../../shared/utils/logger.util';
import { CacheService } from '../cache/cache.service';
import { DashboardCacheStrategy } from '../cache/strategies/dashboard.cache';
import { PermissionCacheStrategy } from '../cache/strategies/permission.cache';
import { ActivityRepository } from '../database/repositories/activity.repository';
import { AuditRepository } from '../database/repositories/audit.repository';
import { CustomerRepository } from '../database/repositories/customer.repository';
import { PrismaFeatureFlagRepository } from '../database/repositories/feature.repository';
import { UserRepository } from '../database/repositories/user.repository';
import { HealthService } from '../observability/health/health.service';
import { MetricsService } from '../observability/metrics/metrics.service';
import { TracingService } from '../observability/tracing/tracing.service';
import { OutboxProcessor } from '../outbox/outbox.processor';
import { OutboxPublisher } from '../outbox/outbox.publisher';
import { OutboxRepository } from '../outbox/outbox.repository';
import { OutboxWorker } from '../outbox/outbox.worker';
import { AIQueue } from '../queue/queues/ai.queue';
import type { EmailQueue } from '../queue/queues/email.queue';
import type { WebSocketGateway } from '../realtime/websocket.gateway';
import { createAnalyticsRollupJob } from '../scheduler/analytics-rollup.job';
import { CronRegistry } from '../scheduler/cron.registry';
import { createOutboxRetryJob } from '../scheduler/outbox-retry.job';
import { SchedulerService } from '../scheduler/scheduler.service';
import { createTenantCleanupJob } from '../scheduler/tenant-cleanup.job';
import { createTicketEscalationJob } from '../scheduler/ticket-escalation.job';
import { SecretsService } from '../security/secrets.service';
import { TokenSigningService } from '../security/token-signing.service';
import { LocalStorageProvider } from '../storage/local.provider';
import { MemoryStorageProvider } from '../storage/memory.provider';
import { S3StorageProvider } from '../storage/s3.provider';

export class Container {
  private services = new Map<string, unknown>();

  register<T>(name: string, instance: T): void {
    this.services.set(name, instance);
  }

  resolve<T>(name: string): T {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service '${name}' not registered in container`);
    }
    return service as T;
  }
}

export function buildContainer(
  prisma: PrismaClient,
  redis: RedisClientType,
  wsGateway: WebSocketGateway,
): Promise<Container> {
  const container = new Container();

  logger.info('Building DI container...');

  // Core Infrastructure
  container.register('prisma', prisma);
  container.register('redis', redis);
  container.register('wsGateway', wsGateway);

  // Cache
  const cacheService = new CacheService(redis);
  container.register('cacheService', cacheService);

  const permissionCache = new PermissionCacheStrategy(cacheService);
  container.register('permissionCache', permissionCache);

  const dashboardCache = new DashboardCacheStrategy(cacheService);
  container.register('dashboardCache', dashboardCache);

  const metricsService = new MetricsService();
  container.register('metricsService', metricsService);

  const tracingService = new TracingService();
  container.register('tracingService', tracingService);

  const featureFlagRepository = new PrismaFeatureFlagRepository(prisma);
  container.register('featureFlagRepository', featureFlagRepository);

  const featureFlagService = new FeatureFlagService(featureFlagRepository);
  container.register('featureFlagService', featureFlagService);

  // Repositories

  const customerRepo = new CustomerRepository(prisma);
  container.register('customerRepo', customerRepo);

  const auditRepo = new AuditRepository(prisma);
  container.register('auditRepo', auditRepo);

  const auditService = new AuditService(auditRepo);
  container.register('auditService', auditService);

  const activityRepo = new ActivityRepository(prisma);
  container.register('activityRepo', activityRepo);

  const userRepo = new UserRepository(prisma);
  container.register('userRepo', userRepo);

  // Queues
  const aiQueue = new AIQueue();
  container.register('aiQueue', aiQueue);

  const outboxRepository = new OutboxRepository(prisma);
  container.register('outboxRepository', outboxRepository);

  // External Providers
  const storageConfig = getStorageConfig();
  const storageProvider =
    storageConfig.provider === 's3'
      ? new S3StorageProvider(storageConfig.aws!)
      : storageConfig.provider === 'local'
        ? new LocalStorageProvider()
        : new MemoryStorageProvider();
  container.register('storageProvider', storageProvider);

  // Event Bus
  const eventDispatcher: IEventBus = new InProcessEventBus();
  const eventBus = new OutboxPublisher(outboxRepository, eventDispatcher);
  container.register('eventBus', eventBus);

  const outboxProcessor = new OutboxProcessor(outboxRepository, eventDispatcher);
  container.register('outboxProcessor', outboxProcessor);

  const outboxWorker = new OutboxWorker(outboxProcessor);
  container.register('outboxWorker', outboxWorker);

  const tokenService = new TokenService(
    prisma,
    new TokenSigningService(),
    new SecretsService(),
  );
  container.register('tokenService', tokenService);

  // Domain Modules
  registerTenantModule(container);
  registerMessagingModule(container); // Needs to be before auth for emailQueue
  registerAttachmentModule(container);
  registerNotificationModule(container);
  registerReportModule(container);

  const cronRegistry = new CronRegistry();
  container.register('cronRegistry', cronRegistry);

  const schedulerService = new SchedulerService(cronRegistry, redis, metricsService);
  container.register('schedulerService', schedulerService);

  // Application Services

  const userService = new UserService(
    userRepo,
    container.resolve('auditRepo'),
    container.resolve('eventBus'),
  );
  container.register('userService', userService);

  const customerService = new CustomerService(
    customerRepo,
    eventBus,
    activityRepo,
    auditRepo,
    container.resolve('aiQueue'), // Requires AIModule to be registered
  );
  container.register('customerService', customerService);

  registerAuthModule(container);
  registerTicketModule(container);
  registerAIModule(container);

  // CQRS Handlers

  container.register('createCustomerHandler', new CreateCustomerHandler(customerService));
  container.register('updateCustomerHandler', new UpdateCustomerHandler(customerService));
  container.register('deleteCustomerHandler', new DeleteCustomerHandler(customerService));
  container.register('getCustomerHandler', new GetCustomerHandler(customerService));
  container.register('listCustomersHandler', new ListCustomersHandler(customerService));
  container.register(
    'customerTimelineHandler',
    new CustomerTimelineHandler(customerService),
  );
  container.register(
    'triggerRiskScoreHandler',
    new TriggerRiskScoreHandler(customerService),
  );

  const analyticsService = new AnalyticsService(prisma, cacheService);
  container.register('analyticsService', analyticsService);

  const searchService = new SearchService(prisma);
  container.register('searchService', searchService);

  const healthService = new HealthService(prisma, redis, metricsService);
  container.register('healthService', healthService);

  const tenantRepo = container.resolve<ITenantRepository>('tenantRepo');
  const analyticsRollupJob = createAnalyticsRollupJob(analyticsService, tenantRepo);
  container.register('analyticsRollupJob', analyticsRollupJob);

  const ticketEscalationJob = createTicketEscalationJob(
    container.resolve('ticketService'),
    container.resolve<ITicketRepository>('ticketRepo'),
    tenantRepo,
  );
  container.register('ticketEscalationJob', ticketEscalationJob);

  const tenantCleanupJob = createTenantCleanupJob(tenantRepo);
  container.register('tenantCleanupJob', tenantCleanupJob);

  const outboxRetryJob = createOutboxRetryJob(outboxProcessor);
  container.register('outboxRetryJob', outboxRetryJob);

  // Register Domain Event Handlers
  const notificationRepository = container.resolve<INotificationRepository>(
    'notificationRepository',
  );
  const emailQueue = container.resolve<EmailQueue>('emailQueue');
  const notificationService = new NotificationService(
    prisma,
    emailQueue,
    wsGateway,
    notificationRepository,
  );
  const ticketCreatedHandler: EventHandler = async (event) => {
    const ticketCreatedEvent = event as TicketCreatedEvent;
    logger.debug('Handling TicketCreatedEvent', {
      ticketId: ticketCreatedEvent.ticketId,
    });

    try {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketCreatedEvent.ticketId },
      });

      if (!ticket) return;

      await notificationService.notifyTicketCreated({
        tenantId: ticketCreatedEvent.tenantId,
        ticketId: ticketCreatedEvent.ticketId,
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
        customerId: ticketCreatedEvent.customerId,
        assignedAgentId: ticket.assignedAgentId ?? undefined,
      });
    } catch (error) {
      logger.error('TicketCreatedEvent handler failed', {
        eventId: ticketCreatedEvent.eventId,
        ticketId: ticketCreatedEvent.ticketId,
        error,
      });
    }
  };

  const ticketAssignedHandler: EventHandler = async (event) => {
    const ticketAssignedEvent = event as TicketAssignedEvent;
    logger.debug('Handling TicketAssignedEvent', {
      ticketId: ticketAssignedEvent.ticketId,
    });

    try {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketAssignedEvent.ticketId },
      });

      if (!ticket) return;

      await notificationService.notifyTicketAssigned({
        tenantId: ticketAssignedEvent.tenantId,
        ticketId: ticketAssignedEvent.ticketId,
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
        agentId: ticketAssignedEvent.agentId,
        assignedById: ticketAssignedEvent.assignedById,
      });
    } catch (error) {
      logger.error('TicketAssignedEvent handler failed', {
        eventId: ticketAssignedEvent.eventId,
        error,
      });
    }
  };

  const ticketEscalatedHandler: EventHandler = async (event) => {
    const ticketEscalatedEvent = event as TicketEscalatedEvent;
    logger.debug('Handling TicketEscalatedEvent', {
      ticketId: ticketEscalatedEvent.ticketId,
    });

    try {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketEscalatedEvent.ticketId },
      });

      if (!ticket) return;

      await notificationService.notifyTicketEscalated({
        tenantId: ticketEscalatedEvent.tenantId,
        ticketId: ticketEscalatedEvent.ticketId,
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
        reason: ticketEscalatedEvent.reason,
        assignedAgentId: ticketEscalatedEvent.assignedAgentId,
      });
    } catch (error) {
      logger.error('TicketEscalatedEvent handler failed', {
        eventId: ticketEscalatedEvent.eventId,
        error,
      });
    }
  };

  const ticketResolvedHandler: EventHandler = async (event) => {
    const ticketResolvedEvent = event as TicketResolvedEvent;
    logger.debug('Handling TicketResolvedEvent', {
      ticketId: ticketResolvedEvent.ticketId,
    });

    try {
      await notificationService.notifyTicketResolved(
        ticketResolvedEvent.ticketId,
        ticketResolvedEvent.tenantId,
      );
    } catch (error) {
      logger.error('TicketResolvedEvent handler failed', {
        eventId: ticketResolvedEvent.eventId,
        error,
      });
    }
  };

  const commentAddedHandler: EventHandler = async (event) => {
    const commentAddedEvent = event as CommentAddedEvent;
    logger.debug('Handling CommentAddedEvent', {
      ticketId: commentAddedEvent.ticketId,
    });

    try {
      const [ticket, author] = await Promise.all([
        prisma.ticket.findUnique({ where: { id: commentAddedEvent.ticketId } }),
        prisma.user.findUnique({ where: { id: commentAddedEvent.authorId } }),
      ]);

      if (!ticket || !author) return;

      await notificationService.notifyCommentAdded({
        tenantId: commentAddedEvent.tenantId,
        ticketId: commentAddedEvent.ticketId,
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
        authorId: commentAddedEvent.authorId,
        authorName: `${author.firstName} ${author.lastName}`,
        commentType: commentAddedEvent.commentType,
        customerId: ticket.customerId,
      });
    } catch (error) {
      logger.error('CommentAddedEvent handler failed', {
        eventId: commentAddedEvent.eventId,
        error,
      });
    }
  };

  eventDispatcher.subscribe('TICKET_CREATED', ticketCreatedHandler);

  eventDispatcher.subscribe('TICKET_ASSIGNED', ticketAssignedHandler);

  eventDispatcher.subscribe('TICKET_ESCALATED', ticketEscalatedHandler);

  eventDispatcher.subscribe('TICKET_RESOLVED', ticketResolvedHandler);

  eventDispatcher.subscribe('COMMENT_ADDED', commentAddedHandler);

  logger.info('Event handlers registered');

  // Controllers

  container.register(
    'customerController',
    new CustomerController(
      container.resolve('createCustomerHandler'),
      container.resolve('updateCustomerHandler'),
      container.resolve('deleteCustomerHandler'),
      container.resolve('getCustomerHandler'),
      container.resolve('listCustomersHandler'),
      container.resolve('customerTimelineHandler'),
      container.resolve('triggerRiskScoreHandler'),
    ),
  );

  container.register('userController', new UserController(userService));

  container.register('analyticsController', new AnalyticsController(analyticsService));
  container.register('dashboardController', new DashboardController(analyticsService));

  container.register('searchController', new SearchController(searchService));

  container.register('healthController', new HealthController(healthService, wsGateway));

  logger.info('DI container built successfully');

  return Promise.resolve(container);
}
