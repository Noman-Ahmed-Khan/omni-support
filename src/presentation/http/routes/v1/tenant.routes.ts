import { Router } from 'express';

import type { Container } from '../../../../shared/di/container';
import type { TenantController } from '../../controllers/tenant.controller';
import {
  createTenantSchema,
  updateTenantSchema,
  suspendTenantSchema,
} from '../../dtos/tenant/tenant.dto';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { createPermissionGuard } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';

export function createTenantRoutes(container: Container): Router {
  const router = Router();
  const requirePermission = createPermissionGuard(container.resolve('permissionService'));
  const controller: TenantController = container.resolve('tenantController');
  const authMiddleware = createAuthMiddleware(container.resolve('tokenService'));

  router.use(authMiddleware);

  // Platform admin only routes
  router.get(
    '/',
    requirePermission('platform:tenants'),
    asyncHandler((req, res, next) => controller.findAll(req, res, next)),
  );

  router.post(
    '/',
    requirePermission('platform:tenants'),
    validate(createTenantSchema),
    asyncHandler((req, res, next) => controller.create(req, res, next)),
  );

  router.get(
    '/:id',
    requirePermission('tenant:read'),
    asyncHandler((req, res, next) => controller.findOne(req, res, next)),
  );

  router.patch(
    '/:id',
    requirePermission('platform:tenants'),
    validate(updateTenantSchema),
    asyncHandler((req, res, next) => controller.update(req, res, next)),
  );

  router.post(
    '/:id/suspend',
    requirePermission('platform:tenants'),
    validate(suspendTenantSchema),
    asyncHandler((req, res, next) => controller.suspend(req, res, next)),
  );

  router.post(
    '/:id/restore',
    requirePermission('platform:tenants'),
    asyncHandler((req, res, next) => controller.restore(req, res, next)),
  );

  return router;
}
