import { PrismaClient } from '@prisma/client';
import { RedisClientType } from 'redis';

// Infrastructure
import { TenantRepository } from '../infrastructure/database/repositories/tenant.repository';
import { TicketRepository } from '../infrastructure/database/repositories/ticket.repository';
import { CustomerRepository } from '../infrastructure/database/repositories/customer.repository';
import { AuditRepository } from '../infrastructure/database/repositories/audit.repository';
import { ActivityRepository } from '../infrastructure/database/repositories/activity.repository';
import { CacheService } from '../infrastructure/cache/cache.service';
import { PermissionCacheStrategy } from '../infrastructure/cache/strategies/permission.cache';
import { DashboardCacheStrategy } from '../infrastructure/cache/strategies/dashboard.cache';
import { AIProviderFactory } from '../infrastructure/ai/ai-provider.factory';
import { S3StorageProvider } from '../infrastructure/storage/s3.provider';
import { LocalStorageProvider } from '../infrastructure/storage/local.provider';
import { SMTPEmailProvider } from '../infrastructure/messaging/email/smtp.provider';
import { TwilioWhatsAppProvider } from '../infrastructure/messaging/whatsapp/twilio-whatsapp.provider';
import { EmailQueue } from '../infrastructure/queue/queues/email.queue';
import { NotificationQueue } from '../infrastructure/queue/queues/notification.queue';
import { AIQueue } from '../infrastructure/queue/queues/ai.queue';

// Application Services
import { TokenService } from '../application/auth/services/token.service';
import { AuthService } from '../application/auth/services/auth.service';
import { OAuthService } from '../application/auth/services/oauth.service';
import { RegisterHandler } from '../application/auth/handlers/register.handler';
import { LoginHandler } from '../application/auth/handlers/login.handler';
import { RefreshTokenHandler } from '../application/auth/handlers/refresh-token.handler';
import { LogoutHandler } from '../application/auth/handlers/logout.handler';
import { VerifyEmailHandler } from '../application/auth/handlers/verify-email.handler';
import { ForgotPasswordHandler } from '../application/auth/handlers/forgot-password.handler';
import { ResetPasswordHandler } from '../application/auth/handlers/reset-password.handler';
import { TicketService } from '../application/ticket/services/ticket.service';
import { CreateTicketHandler } from '../application/ticket/handlers/create-ticket.handler';
import { UpdateTicketHandler } from '../application/ticket/handlers/update-ticket.handler';
import { AssignTicketHandler } from '../application/ticket/handlers/assign-ticket.handler';
import { ChangeTicketStatusHandler } from '../application/ticket/handlers/change-ticket-status.handler';
import { EscalateTicketHandler } from '../application/ticket/handlers/escalate-ticket.handler';
import { AddCommentHandler } from '../application/ticket/handlers/add-comment.handler';
import { CloseTicketHandler } from '../application/ticket/handlers/close-ticket.handler';
import { GetTicketHandler } from '../application/ticket/handlers/get-ticket.handler';
import { ListTicketsHandler } from '../application/ticket/handlers/list-tickets.handler';
import { ResolveTicketHandler } from '../application/ticket/handlers/resolve-ticket.handler';
import { TicketHistoryHandler } from '../application/ticket/handlers/ticket-history.handler';
import { CustomerService } from '../application/customer/services/customer.service';
import { CreateCustomerHandler } from '../application/customer/handlers/create-customer.handler';
import { UpdateCustomerHandler } from '../application/customer/handlers/update-customer.handler';
import { DeleteCustomerHandler } from '../application/customer/handlers/delete-customer.handler';
import { GetCustomerHandler } from '../application/customer/handlers/get-customer.handler';
import { ListCustomersHandler } from '../application/customer/handlers/list-customers.handler';
import { CustomerTimelineHandler } from '../application/customer/handlers/customer-timeline.handler';
import { TriggerRiskScoreHandler } from '../application/customer/handlers/trigger-risk-score.handler';
import { CreateTenantHandler } from '../application/tenant/handlers/create-tenant.handler';
import { UpdateTenantHandler } from '../application/tenant/handlers/update-tenant.handler';
import { SuspendTenantHandler } from '../application/tenant/handlers/suspend-tenant.handler';
import { RestoreTenantHandler } from '../application/tenant/handlers/restore-tenant.handler';
import { GetTenantHandler } from '../application/tenant/handlers/get-tenant.handler';
import { ListTenantsHandler } from '../application/tenant/handlers/list-tenants.handler';
import { AIService } from '../application/ai/services/ai.service';
import { AnalyzeSentimentHandler } from '../application/ai/handlers/analyze-sentiment.handler';
import { CalculateRiskScoreHandler } from '../application/ai/handlers/calculate-risk-score.handler';
import { CategorizeTicketHandler } from '../application/ai/handlers/categorize-ticket.handler';
import { GenerateSummaryHandler } from '../application/ai/handlers/generate-summary.handler';
import { PredictUrgencyHandler } from '../application/ai/handlers/predict-urgency.handler';
import { SuggestResponseHandler } from '../application/ai/handlers/suggest-response.handler';
import { NotificationService } from '../application/notification/services/notification.service';
import { AnalyticsService } from '../application/analytics/services/analytics.service';
import { SearchService } from '../application/search/services/search.service';
import { InProcessEventBus } from '../application/event-bus/event-bus';

// Event Handlers
import { createTicketCreatedHandler } from '../application/event-bus/handlers/ticket-created.handler';
import { createTicketAssignedHandler } from '../application/event-bus/handlers/ticket-assigned.handler';
import { createTicketEscalatedHandler } from '../application/event-bus/handlers/ticket-escalated.handler';
import { createTicketResolvedHandler } from '../application/event-bus/handlers/ticket-resolved.handler';
import { createCommentAddedHandler } from '../application/event-bus/handlers/comment-added.handler';

// Controllers
import { AuthController } from '../presentation/http/controllers/auth.controller';
import { TenantController } from '../presentation/http/controllers/tenant.controller';
import { TicketController } from '../presentation/http/controllers/ticket.controller';
import { CustomerController } from '../presentation/http/controllers/customer.controller';
import { AnalyticsController } from '../presentation/http/controllers/analytics.controller';
import { SearchController } from '../presentation/http/controllers/search.controller';
import { WebhookController } from '../presentation/http/controllers/webhook.controller';
import { HealthController } from '../presentation/http/controllers/health.controller';

import { WebSocketGateway } from '../infrastructure/realtime/websocket.gateway';
import { storageConfig } from '../config/storage.config';
import { logger } from '../shared/utils/logger.util';

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

  // Repositories
  const tenantRepo = new TenantRepository(prisma);
  container.register('tenantRepo', tenantRepo);

  const ticketRepo = new TicketRepository(prisma);
  container.register('ticketRepo', ticketRepo);

  const customerRepo = new CustomerRepository(prisma);
  container.register('customerRepo', customerRepo);

  const auditRepo = new AuditRepository(prisma);
  container.register('auditRepo', auditRepo);

  const activityRepo = new ActivityRepository(prisma);
  container.register('activityRepo', activityRepo);

  // Queues
  const emailQueue = new EmailQueue();
  container.register('emailQueue', emailQueue);

  const notificationQueue = new NotificationQueue();
  container.register('notificationQueue', notificationQueue);

  const aiQueue = new AIQueue();
  container.register('aiQueue', aiQueue);

  // External Providers
  const aiProvider = AIProviderFactory.create();
  container.register('aiProvider', aiProvider);

  const storageProvider =
    storageConfig.provider === 's3'
      ? new S3StorageProvider()
      : new LocalStorageProvider();
  container.register('storageProvider', storageProvider);

  const emailProvider = new SMTPEmailProvider();
  container.register('emailProvider', emailProvider);

  const whatsAppProvider = new TwilioWhatsAppProvider();
  container.register('whatsAppProvider', whatsAppProvider);

  // Event Bus
  const eventBus = new InProcessEventBus();
  container.register('eventBus', eventBus);

  // Application Services
  const tokenService = new TokenService(prisma);
  container.register('tokenService', tokenService);

  const notificationService = new NotificationService(
    prisma,
    emailQueue,
    wsGateway,
  );
  container.register('notificationService', notificationService);

  const customerService = new CustomerService(
    customerRepo,
    eventBus,
    activityRepo,
    auditRepo,
    aiQueue,
  );
  container.register('customerService', customerService);

  const ticketService = new TicketService(
    ticketRepo,
    customerRepo,
    prisma,
    eventBus,
    aiQueue,
    activityRepo,
    auditRepo,
    dashboardCache,
  );
  container.register('ticketService', ticketService);

  const aiService = new AIService(
    aiProvider,
    prisma,
    ticketRepo,
    customerService,
    ticketService,
    activityRepo,
    wsGateway,
  );
  container.register('aiService', aiService);
  container.register('categorizeTicketHandler', new CategorizeTicketHandler(aiService));
  container.register('analyzeSentimentHandler', new AnalyzeSentimentHandler(aiService));
  container.register('predictUrgencyHandler', new PredictUrgencyHandler(aiService));
  container.register('suggestResponseHandler', new SuggestResponseHandler(aiService));
  container.register('generateSummaryHandler', new GenerateSummaryHandler(aiService));
  container.register('calculateRiskScoreHandler', new CalculateRiskScoreHandler(aiService));

  const authService = new AuthService(
    prisma,
    tokenService,
    emailQueue,
    auditRepo,
    cacheService,
  );
  container.register('authService', authService);

  const oauthService = new OAuthService(prisma, tokenService);
  container.register('oauthService', oauthService);

  // CQRS Handlers
  container.register('registerHandler', new RegisterHandler(authService));
  container.register('loginHandler', new LoginHandler(authService));
  container.register('refreshTokenHandler', new RefreshTokenHandler(authService));
  container.register('logoutHandler', new LogoutHandler(authService));
  container.register('verifyEmailHandler', new VerifyEmailHandler(authService));
  container.register('forgotPasswordHandler', new ForgotPasswordHandler(authService));
  container.register('resetPasswordHandler', new ResetPasswordHandler(authService));

  container.register('createTicketHandler', new CreateTicketHandler(ticketService));
  container.register('updateTicketHandler', new UpdateTicketHandler(ticketService));
  container.register('assignTicketHandler', new AssignTicketHandler(ticketService));
  container.register('changeTicketStatusHandler', new ChangeTicketStatusHandler(ticketService));
  container.register('escalateTicketHandler', new EscalateTicketHandler(ticketService));
  container.register('addCommentHandler', new AddCommentHandler(ticketService));
  container.register('closeTicketHandler', new CloseTicketHandler(ticketService));
  container.register('resolveTicketHandler', new ResolveTicketHandler(ticketService));
  container.register('getTicketHandler', new GetTicketHandler(ticketService));
  container.register('listTicketsHandler', new ListTicketsHandler(ticketService));
  container.register('ticketHistoryHandler', new TicketHistoryHandler(ticketService));

  container.register('createCustomerHandler', new CreateCustomerHandler(customerService));
  container.register('updateCustomerHandler', new UpdateCustomerHandler(customerService));
  container.register('deleteCustomerHandler', new DeleteCustomerHandler(customerService));
  container.register('getCustomerHandler', new GetCustomerHandler(customerService));
  container.register('listCustomersHandler', new ListCustomersHandler(customerService));
  container.register('customerTimelineHandler', new CustomerTimelineHandler(customerService));
  container.register('triggerRiskScoreHandler', new TriggerRiskScoreHandler(customerService));

  container.register('createTenantHandler', new CreateTenantHandler(tenantRepo, auditRepo, eventBus));
  container.register('updateTenantHandler', new UpdateTenantHandler(tenantRepo, auditRepo));
  container.register('suspendTenantHandler', new SuspendTenantHandler(tenantRepo, auditRepo, eventBus));
  container.register('restoreTenantHandler', new RestoreTenantHandler(tenantRepo, auditRepo));
  container.register('getTenantHandler', new GetTenantHandler(tenantRepo));
  container.register('listTenantsHandler', new ListTenantsHandler(tenantRepo));

  const analyticsService = new AnalyticsService(prisma, cacheService);
  container.register('analyticsService', analyticsService);

  const searchService = new SearchService(prisma);
  container.register('searchService', searchService);

  // Register Domain Event Handlers
  eventBus.subscribe(
    'TICKET_CREATED',
    createTicketCreatedHandler(notificationService, prisma),
  );

  eventBus.subscribe(
    'TICKET_ASSIGNED',
    createTicketAssignedHandler(notificationService, prisma),
  );

  eventBus.subscribe(
    'TICKET_ESCALATED',
    createTicketEscalatedHandler(notificationService, prisma),
  );

  eventBus.subscribe(
    'TICKET_RESOLVED',
    createTicketResolvedHandler(notificationService),
  );

  eventBus.subscribe(
    'COMMENT_ADDED',
    createCommentAddedHandler(notificationService, prisma),
  );

  logger.info('Event handlers registered');

  // Controllers
  container.register(
    'authController',
    new AuthController(
      container.resolve('registerHandler'),
      container.resolve('loginHandler'),
      container.resolve('refreshTokenHandler'),
      container.resolve('logoutHandler'),
      container.resolve('verifyEmailHandler'),
      container.resolve('forgotPasswordHandler'),
      container.resolve('resetPasswordHandler'),
      oauthService,
    ),
  );

  container.register(
    'tenantController',
    new TenantController(
      container.resolve('createTenantHandler'),
      container.resolve('updateTenantHandler'),
      container.resolve('suspendTenantHandler'),
      container.resolve('restoreTenantHandler'),
      container.resolve('getTenantHandler'),
      container.resolve('listTenantsHandler'),
    ),
  );

  container.register(
    'ticketController',
    new TicketController(
      container.resolve('createTicketHandler'),
      container.resolve('updateTicketHandler'),
      container.resolve('assignTicketHandler'),
      container.resolve('changeTicketStatusHandler'),
      container.resolve('escalateTicketHandler'),
      container.resolve('addCommentHandler'),
      container.resolve('getTicketHandler'),
      container.resolve('listTicketsHandler'),
      container.resolve('ticketHistoryHandler'),
    ),
  );

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

  container.register(
    'analyticsController',
    new AnalyticsController(analyticsService),
  );

  container.register(
    'searchController',
    new SearchController(searchService),
  );

  container.register(
    'webhookController',
    new WebhookController(
      whatsAppProvider,
      ticketService,
      prisma,
    ),
  );

  container.register(
    'healthController',
    new HealthController(prisma, redis, wsGateway),
  );

  logger.info('DI container built successfully');

  return Promise.resolve(container);
}
