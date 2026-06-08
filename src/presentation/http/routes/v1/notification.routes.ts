import { Router } from 'express';

import type { Container } from '../../../../infrastructure/di';
import type { NotificationController } from '../../controllers/notification.controller';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { createTenantMiddleware } from '../../middlewares/tenant.middleware';
import { asyncHandler } from '../../utils/async-handler';

export function createNotificationRoutes(container: Container): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(container.resolve('tokenService'));
  const tenantMiddleware = createTenantMiddleware(container.resolve('prisma'));
  const controller = container.resolve<NotificationController>('notificationController');

  router.use(authMiddleware, tenantMiddleware);

  router.get(
    '/',
    asyncHandler((req, res, next) => controller.getUserNotifications(req, res, next)),
  );

  router.patch(
    '/:id/read',
    asyncHandler((req, res, next) => controller.markAsRead(req, res, next)),
  );

  router.patch(
    '/mark-all-read',
    asyncHandler((req, res, next) => controller.markAllAsRead(req, res, next)),
  );

  return router;
}
