import { Router } from 'express';

import type { Container } from '../../../../shared/di/container';
import type { AnalyticsController } from '../../controllers/analytics.controller';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { createPermissionGuard } from '../../middlewares/permission.middleware';
import {
  createTenantMiddleware,
  requireTenantContext,
} from '../../middlewares/tenant.middleware';
import { asyncHandler } from '../../utils/async-handler';

export function createAnalyticsRoutes(container: Container): Router {
  const router = Router();
  const requirePermission = createPermissionGuard(container.resolve('permissionService'));
  const controller: AnalyticsController = container.resolve('analyticsController');
  const authMiddleware = createAuthMiddleware(container.resolve('tokenService'));
  const tenantMiddleware = createTenantMiddleware(container.resolve('prisma'));

  router.use(authMiddleware, tenantMiddleware);

  router.get(
    '/trends',
    requireTenantContext,
    requirePermission('analytics:read'),
    asyncHandler((req, res, next) => controller.getTrends(req, res, next)),
  );

  router.get(
    '/platform',
    requirePermission('platform:analytics'),
    asyncHandler((req, res, next) => controller.getPlatformMetrics(req, res, next)),
  );

  return router;
}
