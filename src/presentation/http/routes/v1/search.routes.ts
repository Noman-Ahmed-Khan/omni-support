import { Router } from 'express';

import type { Container } from '../../../../shared/di/container';
import type { SearchController } from '../../controllers/search.controller';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { createPermissionGuard } from '../../middlewares/permission.middleware';
import {
  createTenantMiddleware,
  requireTenantContext,
} from '../../middlewares/tenant.middleware';
import { asyncHandler } from '../../utils/async-handler';

export function createSearchRoutes(container: Container): Router {
  const router = Router();
  const requirePermission = createPermissionGuard(container.resolve('permissionService'));
  const controller: SearchController = container.resolve('searchController');
  const authMiddleware = createAuthMiddleware(container.resolve('tokenService'));
  const tenantMiddleware = createTenantMiddleware(container.resolve('prisma'));

  // Tenant data only: requests without an organization context are rejected.
  router.use(
    authMiddleware,
    tenantMiddleware,
    requireTenantContext,
    // Search spans tickets, customers and comments: staff only.
    requirePermission('search:use'),
  );

  router.get(
    '/',
    asyncHandler((req, res, next) => controller.search(req, res, next)),
  );

  return router;
}
