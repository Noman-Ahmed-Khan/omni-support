import { Router } from 'express';
import { SearchController } from '../../controllers/search.controller';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { createTenantMiddleware } from '../../middlewares/tenant.middleware';

export function createSearchRoutes(container: any): Router {
  const router = Router();
  const controller: SearchController = container.resolve('searchController');
  const authMiddleware = createAuthMiddleware(container.resolve('tokenService'));
  const tenantMiddleware = createTenantMiddleware(container.resolve('prisma'));

  router.use(authMiddleware, tenantMiddleware);

  router.get('/', (req, res, next) => controller.search(req, res, next));

  return router;
}