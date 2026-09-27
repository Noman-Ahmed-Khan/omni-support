import { Router } from 'express';

import type { Container } from '../../../../shared/di/container';
import type { ReportController } from '../../controllers/report.controller';
import { generateReportSchema } from '../../controllers/report.controller';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { createPermissionGuard } from '../../middlewares/permission.middleware';
import {
  createTenantMiddleware,
  requireTenantContext,
} from '../../middlewares/tenant.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';

export function createReportRoutes(container: Container): Router {
  const router = Router();
  const requirePermission = createPermissionGuard(container.resolve('permissionService'));
  const controller: ReportController = container.resolve('reportController');
  const authMiddleware = createAuthMiddleware(container.resolve('tokenService'));
  const tenantMiddleware = createTenantMiddleware(container.resolve('prisma'));

  // Tenant data only: requests without an organization context are rejected.
  router.use(authMiddleware, tenantMiddleware, requireTenantContext);

  router.post(
    '/generate',
    requirePermission('reports:create'),
    validate(generateReportSchema),
    asyncHandler((req, res) => controller.generateReport(req, res)),
  );

  router.get(
    '/',
    requirePermission('reports:create'),
    asyncHandler((req, res) => controller.list(req, res)),
  );
  router.get(
    '/:id',
    requirePermission('reports:create'),
    asyncHandler((req, res) => controller.get(req, res)),
  );
  router.post(
    '/:id/cancel',
    requirePermission('reports:create'),
    asyncHandler((req, res) => controller.cancel(req, res)),
  );
  router.get(
    '/:id/download-url',
    requirePermission('reports:create'),
    asyncHandler((req, res) => controller.download(req, res)),
  );

  return router;
}
