import { Router } from 'express';

import type { Container } from '../../../../infrastructure/di';
import type { SearchController } from '../../controllers/search.controller';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { createTenantMiddleware } from '../../middlewares/tenant.middleware';
import { asyncHandler } from '../../utils/async-handler';

export function createSearchRoutes(container: Container): Router {
  const router = Router();
  const controller: SearchController = container.resolve('searchController');
  const authMiddleware = createAuthMiddleware(container.resolve('tokenService'));
  const tenantMiddleware = createTenantMiddleware(container.resolve('prisma'));

  router.use(authMiddleware, tenantMiddleware);

  router.get(
    '/',
    asyncHandler((req, res, next) => controller.search(req, res, next)),
  );

  return router;
}
