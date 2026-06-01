import { Router } from 'express';
import { CustomerController } from '../../controllers/customer.controller';
import { validate } from '../../middlewares/validate.middleware';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { createTenantMiddleware } from '../../middlewares/tenant.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomersQuerySchema,
} from '../../dtos/customer/customer.dto';

export function createCustomerRoutes(container: any): Router {
  const router = Router();
  const controller: CustomerController = container.resolve('customerController');
  const authMiddleware = createAuthMiddleware(
    container.resolve('tokenService'),
  );
  const tenantMiddleware = createTenantMiddleware(
    container.resolve('prisma'),
  );

  router.use(authMiddleware, tenantMiddleware);

  router.get(
    '/',
    validate(listCustomersQuerySchema, 'query'),
    (req, res, next) => controller.findAll(req, res, next),
  );

  router.post(
    '/',
    requireRole('TENANT_MANAGER', 'AGENT'),
    validate(createCustomerSchema),
    (req, res, next) => controller.create(req, res, next),
  );

  router.get('/:id', (req, res, next) => controller.findOne(req, res, next));

  router.patch(
    '/:id',
    requireRole('TENANT_MANAGER', 'AGENT'),
    validate(updateCustomerSchema),
    (req, res, next) => controller.update(req, res, next),
  );

  router.delete(
    '/:id',
    requireRole('TENANT_MANAGER'),
    (req, res, next) => controller.delete(req, res, next),
  );

  router.get(
    '/:id/timeline',
    (req, res, next) => controller.getTimeline(req, res, next),
  );

  router.post(
    '/:id/risk-score',
    requireRole('TENANT_MANAGER'),
    (req, res, next) => controller.triggerRiskScore(req, res, next),
  );

  return router;
}