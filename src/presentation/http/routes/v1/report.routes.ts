import { Router } from 'express';

import type { Container } from '../../../../infrastructure/di';
import type { ReportController } from '../../controllers/report.controller';
import { generateReportSchema } from '../../controllers/report.controller';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import { createTenantMiddleware } from '../../middlewares/tenant.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';

export function createReportRoutes(container: Container): Router {
  const router = Router();
  const controller: ReportController = container.resolve('reportController');
  const authMiddleware = createAuthMiddleware(container.resolve('tokenService'));
  const tenantMiddleware = createTenantMiddleware(container.resolve('prisma'));

  router.use(authMiddleware, tenantMiddleware);

  router.post(
    '/generate',
    requireRole('TENANT_MANAGER', 'AGENT'),
    validate(generateReportSchema),
    asyncHandler((req, res, next) => controller.generateReport(req, res, next)),
  );

  return router;
}
