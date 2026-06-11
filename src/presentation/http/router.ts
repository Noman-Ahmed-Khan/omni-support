import { Router } from 'express';

import type { HealthController } from './controllers/health.controller';
import { createHealthRouter } from './routes/health.routes';
import { createV1Router } from './routes/v1';
import { getAppConfig } from '../../config/app.config';
import type { Container } from '../../infrastructure/di';

export function createApplicationRouter(container: Container): Router {
  const router = Router();
  const healthController: HealthController = container.resolve('healthController');

  // Health Routes (no auth)
  router.use('/health', createHealthRouter(container));
  router.get('/metrics', (req, res) => healthController.metrics(req, res));

  // API v1 Routes
  router.use(getAppConfig().apiPrefix, createV1Router(container));

  // 404 Handler
  router.use((_req, res) => {
    res.status(404).json({
      type: 'https://omnisupport.io/errors/not-found',
      title: 'Not Found',
      status: 404,
      detail: 'The requested resource was not found',
    });
  });

  return router;
}
