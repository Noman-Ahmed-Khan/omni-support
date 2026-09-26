import { Router } from 'express';

import type { Container } from '../../../../shared/di/container';
import type { ReportController } from '../../controllers/report.controller';
import { generateReportSchema } from '../../controllers/report.controller';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import {
  createTenantMiddleware,
  requireTenantContext,
} from '../../middlewares/tenant.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';

export function createReportRoutes(container: Container): Router {
  const router = Router();
  const controller: ReportController = container.resolve('reportController');
  const authMiddleware = createAuthMiddleware(container.resolve('tokenService'));
  const tenantMiddleware = createTenantMiddleware(container.resolve('prisma'));

  // Tenant data only: requests without an organization context are rejected.
  router.use(authMiddleware, tenantMiddleware, requireTenantContext);

  router.post(
    '/generate',
    requireRole('TENANT_MANAGER', 'AGENT'),
    validate(generateReportSchema),
    asyncHandler((req, res, next) => controller.generateReport(req, res, next)),
  );

  return router;
}
