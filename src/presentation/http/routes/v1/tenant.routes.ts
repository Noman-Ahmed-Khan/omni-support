import { Router } from 'express';

import type { Container } from '../../../../infrastructure/di';
import type { TenantController } from '../../controllers/tenant.controller';
import {
  createTenantSchema,
  updateTenantSchema,
  suspendTenantSchema,
} from '../../dtos/tenant/tenant.dto';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';

export function createTenantRoutes(container: Container): Router {
  const router = Router();
  const controller: TenantController = container.resolve('tenantController');
  const authMiddleware = createAuthMiddleware(container.resolve('tokenService'));

  router.use(authMiddleware);

  // Platform admin only routes
  router.get(
    '/',
    requireRole('PLATFORM_ADMIN'),
    asyncHandler((req, res, next) => controller.findAll(req, res, next)),
  );

  router.post(
    '/',
    requireRole('PLATFORM_ADMIN'),
    validate(createTenantSchema),
    asyncHandler((req, res, next) => controller.create(req, res, next)),
  );

  router.get(
    '/:id',
    requireRole('PLATFORM_ADMIN', 'TENANT_MANAGER'),
    asyncHandler((req, res, next) => controller.findOne(req, res, next)),
  );

  router.patch(
    '/:id',
    requireRole('PLATFORM_ADMIN'),
    validate(updateTenantSchema),
    asyncHandler((req, res, next) => controller.update(req, res, next)),
  );

  router.post(
    '/:id/suspend',
    requireRole('PLATFORM_ADMIN'),
    validate(suspendTenantSchema),
    asyncHandler((req, res, next) => controller.suspend(req, res, next)),
  );

  router.post(
    '/:id/restore',
    requireRole('PLATFORM_ADMIN'),
    asyncHandler((req, res, next) => controller.restore(req, res, next)),
  );

  return router;
}
