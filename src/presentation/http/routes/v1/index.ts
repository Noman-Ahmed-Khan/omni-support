import { Router } from 'express';

import { createAIRoutes } from './ai.routes';
import { createAnalyticsRoutes } from './analytics.routes';
import { createAttachmentRoutes } from './attachment.routes';
import { createAuthRoutes } from './auth.routes';
import { createCommentRoutes } from './comment.routes';
import { createCustomerRoutes } from './customer.routes';
import { createDashboardRoutes } from './dashboard.routes';
import { createNotificationRoutes } from './notification.routes';
import { createReportRoutes } from './report.routes';
import { createSearchRoutes } from './search.routes';
import { createTenantRoutes } from './tenant.routes';
import { createTicketRoutes } from './ticket.routes';
import { createUserRoutes } from './user.routes';
import type { Container } from '../../../../infrastructure/di';
import { createWhatsAppWebhook } from '../../../webhooks/whatsapp.webhook';

export function createV1Router(container: Container): Router {
  const router = Router();

  router.use('/auth', createAuthRoutes(container));
  router.use('/users', createUserRoutes(container));
  router.use('/tenants', createTenantRoutes(container));
  router.use('/tickets', createTicketRoutes(container));
  router.use('/comments', createCommentRoutes(container));
  router.use('/attachments', createAttachmentRoutes(container));
  router.use('/ai', createAIRoutes(container));
  router.use('/customers', createCustomerRoutes(container));
  router.use('/analytics', createAnalyticsRoutes(container));
  router.use('/dashboards', createDashboardRoutes(container));
  router.use('/reports', createReportRoutes(container));
  router.use('/search', createSearchRoutes(container));
  router.use(
    '/webhooks/whatsapp',
    createWhatsAppWebhook(
      container.resolve('whatsAppProvider'),
      container.resolve('ticketService'),
      container.resolve('prisma'),
    ),
  );
  router.use('/notifications', createNotificationRoutes(container));

  return router;
}
