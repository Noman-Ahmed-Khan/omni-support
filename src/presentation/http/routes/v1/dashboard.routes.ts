import { Router } from 'express';

import type { Container } from '../../../../shared/di/container';
import type { DashboardController } from '../../controllers/dashboard.controller';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { createPermissionGuard } from '../../middlewares/permission.middleware';
import {
  createTenantMiddleware,
  requireTenantContext,
} from '../../middlewares/tenant.middleware';
import { asyncHandler } from '../../utils/async-handler';

export function createDashboardRoutes(container: Container): Router {
  const router = Router();
  const requirePermission = createPermissionGuard(container.resolve('permissionService'));
  const controller: DashboardController = container.resolve('dashboardController');
  const authMiddleware = createAuthMiddleware(container.resolve('tokenService'));
  const tenantMiddleware = createTenantMiddleware(container.resolve('prisma'));

  // Tenant data only: requests without an organization context are rejected.
  router.use(authMiddleware, tenantMiddleware, requireTenantContext);

  router.get(
    '/',
    requirePermission('dashboard:read'),
    asyncHandler((req, res, next) => controller.getDashboard(req, res, next)),
  );

  return router;
}
