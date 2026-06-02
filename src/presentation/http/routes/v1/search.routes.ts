import { Router } from 'express';
import { SearchController } from '../../controllers/search.controller';
import { Container } from '../../../../container';
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
