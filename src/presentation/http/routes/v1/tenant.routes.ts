import { Router } from 'express';
import { TenantController } from '../../controllers/tenant.controller';
import { validate } from '../../middlewares/validate.middleware';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import {
  createTenantSchema,
  updateTenantSchema,
  suspendTenantSchema,
} from '../../dtos/tenant/tenant.dto';

export function createTenantRoutes(container: any): Router {
  const router = Router();
  const controller: TenantController = container.resolve('tenantController');
  const authMiddleware = createAuthMiddleware(
    container.resolve('tokenService'),
  );

  router.use(authMiddleware);

  // Platform admin only routes
  router.get(
    '/',
    requireRole('PLATFORM_ADMIN'),
    (req, res, next) => controller.findAll(req, res, next),
  );

  router.post(
    '/',
    requireRole('PLATFORM_ADMIN'),
    validate(createTenantSchema),
    (req, res, next) => controller.create(req, res, next),
  );

  router.get(
    '/:id',
    requireRole('PLATFORM_ADMIN', 'TENANT_MANAGER'),
    (req, res, next) => controller.findOne(req, res, next),
  );

  router.patch(
    '/:id',
    requireRole('PLATFORM_ADMIN'),
    validate(updateTenantSchema),
    (req, res, next) => controller.update(req, res, next),
  );

  router.post(
    '/:id/suspend',
    requireRole('PLATFORM_ADMIN'),
    validate(suspendTenantSchema),
    (req, res, next) => controller.suspend(req, res, next),
  );

  router.post(
    '/:id/restore',
    requireRole('PLATFORM_ADMIN'),
    (req, res, next) => controller.restore(req, res, next),
  );

  return router;
}