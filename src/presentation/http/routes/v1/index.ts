import { Router } from 'express';
import { createAuthRoutes } from './auth.routes';
import { createTenantRoutes } from './tenant.routes';
import { createTicketRoutes } from './ticket.routes';
import { createCustomerRoutes } from './customer.routes';
import { createAnalyticsRoutes } from './analytics.routes';
import { createSearchRoutes } from './search.routes';
import { createWebhookRoutes } from './webhook.routes';
import { createNotificationRoutes } from './notification.routes';

export function createV1Router(container: any): Router {
  const router = Router();

  router.use('/auth', createAuthRoutes(container));
  router.use('/tenants', createTenantRoutes(container));
  router.use('/tickets', createTicketRoutes(container));
  router.use('/customers', createCustomerRoutes(container));
  router.use('/analytics', createAnalyticsRoutes(container));
  router.use('/search', createSearchRoutes(container));
  router.use('/webhooks', createWebhookRoutes(container));
  router.use('/notifications', createNotificationRoutes(container));

  return router;
}