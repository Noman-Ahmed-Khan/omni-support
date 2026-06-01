import { Router } from 'express';
import { AnalyticsController } from '../../controllers/analytics.controller';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { createTenantMiddleware } from '../../middlewares/tenant.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';

export function createAnalyticsRoutes(container: any): Router {
  const router = Router();
  const controller: AnalyticsController = container.resolve('analyticsController');
  const authMiddleware = createAuthMiddleware(container.resolve('tokenService'));
  const tenantMiddleware = createTenantMiddleware(container.resolve('prisma'));

  router.use(authMiddleware, tenantMiddleware);

  router.get(
    '/dashboard',
    requireRole('TENANT_MANAGER', 'AGENT'),
    (req, res, next) => controller.getDashboard(req, res, next),
  );

  router.get(
    '/trends',
    requireRole('TENANT_MANAGER'),
    (req, res, next) => controller.getTrends(req, res, next),
  );

  router.get(
    '/platform',
    requireRole('PLATFORM_ADMIN'),
    (req, res, next) => controller.getPlatformMetrics(req, res, next),
  );

  return router;
}