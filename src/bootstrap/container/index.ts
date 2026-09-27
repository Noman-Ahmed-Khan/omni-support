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
import { OperationalSettingsService } from '../../application/admin/services/operational-settings.service';
import { PlatformOperationsService } from '../../application/admin/services/platform-operations.service';
import { AnalyticsService } from '../../application/analytics/services/analytics.service';
import { AuditService } from '../../application/audit/services/audit.service';
import { PermissionService } from '../../application/auth/services/permission.service';
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
import type { IEventBus } from '../../application/event-bus/event-bus.interface';
import { registerNotificationHandlers } from '../../application/event-bus/handlers/notification.handlers';
import { FeatureFlagService } from '../../application/feature-flags/feature-flag.service';
import { ProcessInboundWhatsAppHandler } from '../../application/messaging/handlers/process-inbound-whatsapp.handler';
import { WebhookProcessingService } from '../../application/messaging/services/webhook-processing.service';
import type { NotificationService } from '../../application/notification/services/notification.service';
import { SearchService } from '../../application/search/services/search.service';
import {
  ChannelIntegrationService,
  createSharedProviderStatus,
} from '../../application/tenant/services/channel-integration.service';
import { UserService } from '../../application/user/services/user.service';
import { getStorageConfig } from '../../config/storage.config';
import type { ITenantRepository } from '../../domain/tenant/repositories/tenant.repository.interface';
import type { ITicketRepository } from '../../domain/ticket/repositories/ticket.repository.interface';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { DashboardCacheStrategy } from '../../infrastructure/cache/strategies/dashboard.cache';
import { ActivityRepository } from '../../infrastructure/database/repositories/activity.repository';
import { AuditRepository } from '../../infrastructure/database/repositories/audit.repository';
import { CustomerRepository } from '../../infrastructure/database/repositories/customer.repository';
import { PrismaFeatureFlagRepository } from '../../infrastructure/database/repositories/feature.repository';
import { UserRepository } from '../../infrastructure/database/repositories/user.repository';
import { TransactionManager } from '../../infrastructure/database/transaction-manager';
import { isWhatsAppConfigured } from '../../infrastructure/messaging/whatsapp/twilio-whatsapp.provider';
import { HealthService } from '../../infrastructure/observability/health/health.service';
import { MetricsService } from '../../infrastructure/observability/metrics/metrics.service';
import {
  createOutboxGaugeCollector,
  createQueueGaugeCollector,
} from '../../infrastructure/observability/metrics/operational-gauges';
import { TracingService } from '../../infrastructure/observability/tracing/tracing.service';
import { OutboxProcessor } from '../../infrastructure/outbox/outbox.processor';
import { OutboxPublisher } from '../../infrastructure/outbox/outbox.publisher';
import { OutboxRepository } from '../../infrastructure/outbox/outbox.repository';
import { OutboxWorker } from '../../infrastructure/outbox/outbox.worker';
import { RedisHandlerLedger } from '../../infrastructure/outbox/redis-handler-ledger';
import { AIQueue } from '../../infrastructure/queue/queues/ai.queue';
import type { RealtimePublisher } from '../../infrastructure/realtime/realtime-publisher';
import type { WebSocketGateway } from '../../infrastructure/realtime/websocket.gateway';
import { createAnalyticsRollupJob } from '../../infrastructure/scheduler/analytics-rollup.job';
import { CronRegistry } from '../../infrastructure/scheduler/cron.registry';
import { SchedulerService } from '../../infrastructure/scheduler/scheduler.service';
import { createTenantCleanupJob } from '../../infrastructure/scheduler/tenant-cleanup.job';
import { createTicketEscalationJob } from '../../infrastructure/scheduler/ticket-escalation.job';
import { EncryptionService } from '../../infrastructure/security/encryption.service';
import { SecretsService } from '../../infrastructure/security/secrets.service';
import { TokenSigningService } from '../../infrastructure/security/token-signing.service';
import { LocalStorageProvider } from '../../infrastructure/storage/local.provider';
import { MemoryStorageProvider } from '../../infrastructure/storage/memory.provider';
import { S3StorageProvider } from '../../infrastructure/storage/s3.provider';
import { AnalyticsController } from '../../presentation/http/controllers/analytics.controller';
import { CustomerController } from '../../presentation/http/controllers/customer.controller';
import { DashboardController } from '../../presentation/http/controllers/dashboard.controller';
import { HealthController } from '../../presentation/http/controllers/health.controller';
import { SearchController } from '../../presentation/http/controllers/search.controller';
import { UserController } from '../../presentation/http/controllers/user.controller';
import { Container } from '../../shared/di/container';
import { logger } from '../../shared/utils/logger.util';

export interface ContainerOptions {
  /**
   * How realtime events are delivered. Defaults to the local gateway; production
   * processes pass a RedisRealtimePublisher so events reach every API replica.
   */
  realtimePublisher?: RealtimePublisher;
}

export { Container };

export function buildContainer(
  prisma: PrismaClient,
  redis: RedisClientType,
  wsGateway: WebSocketGateway,
  options: ContainerOptions = {},
): Promise<Container> {
  const container = new Container();

  logger.info('Building DI container...');

  // Core Infrastructure
  container.register('prisma', prisma);
  container.register('redis', redis);
  container.register('wsGateway', wsGateway);
  container.register<RealtimePublisher>(
    'realtimePublisher',
    options.realtimePublisher ?? wsGateway,
  );

  // Cache
  const cacheService = new CacheService(redis);
  container.register('cacheService', cacheService);

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

  const auditRepo = new AuditRepository(prisma, metricsService);
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
        ? new LocalStorageProvider(storageConfig.local!)
        : new MemoryStorageProvider();
  container.register('storageProvider', storageProvider);

  // Event Bus
  const eventDispatcher: IEventBus = new InProcessEventBus(new RedisHandlerLedger(redis));
  const eventBus = new OutboxPublisher(outboxRepository, eventDispatcher);
  container.register('eventBus', eventBus);

  const outboxProcessor = new OutboxProcessor(outboxRepository, eventDispatcher);
  container.register('outboxProcessor', outboxProcessor);

  const operationalSettings = new OperationalSettingsService(prisma);
  container.register('operationalSettings', operationalSettings);

  const outboxWorker = new OutboxWorker(
    outboxProcessor,
    5000,
    async () => (await operationalSettings.get()).outboxPaused,
  );
  container.register('outboxWorker', outboxWorker);

  const tokenService = new TokenService(
    prisma,
    new TokenSigningService(),
    new SecretsService(),
  );
  container.register('tokenService', tokenService);
  container.register('permissionService', new PermissionService(prisma));

  // Domain Modules
  registerTenantModule(container);
  registerMessagingModule(container); // Needs to be before auth for emailQueue
  container.register(
    'channelIntegrationService',
    new ChannelIntegrationService(
      prisma,
      new EncryptionService(new SecretsService().getEncryptionKey()),
      container.resolve('emailProvider'),
      createSharedProviderStatus(isWhatsAppConfigured),
      auditRepo,
    ),
  );
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
    tokenService,
  );
  container.register('userService', userService);

  const customerService = new CustomerService(
    customerRepo,
    eventBus,
    activityRepo,
    auditRepo,
    container.resolve('aiQueue'), // Requires AIModule to be registered
    userRepo,
    new TransactionManager(prisma),
  );
  container.register('customerService', customerService);

  registerAuthModule(container);
  registerTicketModule(container);
  const webhookProcessing = new WebhookProcessingService(
    prisma,
    container.resolve('whatsAppProvider'),
    new ProcessInboundWhatsAppHandler(prisma, container.resolve('ticketService')),
  );
  container.register('webhookProcessingService', webhookProcessing);
  container.register(
    'platformOperationsService',
    new PlatformOperationsService(
      prisma,
      operationalSettings,
      webhookProcessing,
      auditRepo,
    ),
  );
  registerAttachmentModule(container); // Needs ticketAccessService
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

  const healthService = new HealthService(prisma, redis, metricsService, [
    createOutboxGaugeCollector(metricsService, outboxRepository),
    createQueueGaugeCollector(metricsService),
  ]);
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

  // Register Domain Event Handlers
  registerNotificationHandlers(
    eventDispatcher,
    container.resolve<NotificationService>('notificationService'),
    prisma,
  );

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
