import { Router } from 'express';

import type { Container } from '../../../../infrastructure/di';
import type { DashboardController } from '../../controllers/dashboard.controller';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import { createTenantMiddleware } from '../../middlewares/tenant.middleware';
import { asyncHandler } from '../../utils/async-handler';

export function createDashboardRoutes(container: Container): Router {
  const router = Router();
  const controller: DashboardController = container.resolve('dashboardController');
  const authMiddleware = createAuthMiddleware(container.resolve('tokenService'));
  const tenantMiddleware = createTenantMiddleware(container.resolve('prisma'));

  router.use(authMiddleware, tenantMiddleware);

  router.get(
    '/',
    requireRole('TENANT_MANAGER', 'AGENT'),
    asyncHandler((req, res, next) => controller.getDashboard(req, res, next)),
  );

  return router;
}
