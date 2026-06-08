import { Router } from 'express';

import type { Container } from '../../../infrastructure/di';
import type { HealthController } from '../controllers/health.controller';
import { asyncHandler } from '../utils/async-handler';

export function createHealthRouter(container: Container): Router {
  const router = Router();
  const controller: HealthController = container.resolve('healthController');

  router.get(
    '/',
    asyncHandler((req, res) => controller.full(req, res)),
  );
  router.get('/live', (req, res) => controller.liveness(req, res));
  router.get(
    '/ready',
    asyncHandler((req, res) => controller.readiness(req, res)),
  );
  router.get('/metrics', (req, res) => controller.metrics(req, res));

  return router;
}
