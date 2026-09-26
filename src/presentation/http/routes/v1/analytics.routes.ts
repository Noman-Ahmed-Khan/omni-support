import { Router } from 'express';

import type { Container } from '../../../../shared/di/container';
import type { AnalyticsController } from '../../controllers/analytics.controller';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import {
  createTenantMiddleware,
  requireTenantContext,
} from '../../middlewares/tenant.middleware';
import { asyncHandler } from '../../utils/async-handler';

export function createAnalyticsRoutes(container: Container): Router {
  const router = Router();
  const controller: AnalyticsController = container.resolve('analyticsController');
  const authMiddleware = createAuthMiddleware(container.resolve('tokenService'));
  const tenantMiddleware = createTenantMiddleware(container.resolve('prisma'));

  router.use(authMiddleware, tenantMiddleware);

  router.get(
    '/trends',
    requireTenantContext,
    requireRole('TENANT_MANAGER'),
    asyncHandler((req, res, next) => controller.getTrends(req, res, next)),
  );

  router.get(
    '/platform',
    requireRole('PLATFORM_ADMIN'),
    asyncHandler((req, res, next) => controller.getPlatformMetrics(req, res, next)),
  );

  return router;
}
