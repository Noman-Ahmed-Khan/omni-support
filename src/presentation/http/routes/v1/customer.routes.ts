import { Router } from 'express';

import type { Container } from '../../../../infrastructure/di';
import type { CustomerController } from '../../controllers/customer.controller';
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomersQuerySchema,
} from '../../dtos/customer/customer.dto';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import { createTenantMiddleware } from '../../middlewares/tenant.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';

export function createCustomerRoutes(container: Container): Router {
  const router = Router();
  const controller: CustomerController = container.resolve('customerController');
  const authMiddleware = createAuthMiddleware(container.resolve('tokenService'));
  const tenantMiddleware = createTenantMiddleware(container.resolve('prisma'));

  router.use(authMiddleware, tenantMiddleware);

  router.get(
    '/',
    validate(listCustomersQuerySchema, 'query'),
    asyncHandler((req, res, next) => controller.findAll(req, res, next)),
  );

  router.post(
    '/',
    requireRole('TENANT_MANAGER', 'AGENT'),
    validate(createCustomerSchema),
    asyncHandler((req, res, next) => controller.create(req, res, next)),
  );

  router.get(
    '/:id',
    asyncHandler((req, res, next) => controller.findOne(req, res, next)),
  );

  router.patch(
    '/:id',
    requireRole('TENANT_MANAGER', 'AGENT'),
    validate(updateCustomerSchema),
    asyncHandler((req, res, next) => controller.update(req, res, next)),
  );

  router.delete(
    '/:id',
    requireRole('TENANT_MANAGER'),
    asyncHandler((req, res, next) => controller.delete(req, res, next)),
  );

  router.get(
    '/:id/timeline',
    asyncHandler((req, res, next) => controller.getTimeline(req, res, next)),
  );

  router.post(
    '/:id/risk-score',
    requireRole('TENANT_MANAGER'),
    asyncHandler((req, res, next) => controller.triggerRiskScore(req, res, next)),
  );

  return router;
}
