import { Router } from 'express';
import { AnalyticsController } from '../../controllers/analytics.controller';
import { Container } from '../../../../container';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { createTenantMiddleware } from '../../middlewares/tenant.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import { asyncHandler } from '../../utils/async-handler';

export function createAnalyticsRoutes(container: Container): Router {
  const router = Router();
  const controller: AnalyticsController = container.resolve('analyticsController');
  const authMiddleware = createAuthMiddleware(container.resolve('tokenService'));
  const tenantMiddleware = createTenantMiddleware(container.resolve('prisma'));

  router.use(authMiddleware, tenantMiddleware);

  router.get(
    '/dashboard',
    requireRole('TENANT_MANAGER', 'AGENT'),
    asyncHandler((req, res, next) => controller.getDashboard(req, res, next)),
  );

  router.get(
    '/trends',
    requireRole('TENANT_MANAGER'),
    asyncHandler((req, res, next) => controller.getTrends(req, res, next)),
  );

  router.get(
    '/platform',
    requireRole('PLATFORM_ADMIN'),
    asyncHandler((req, res, next) =>
      controller.getPlatformMetrics(req, res, next),
    ),
  );

  return router;
}
