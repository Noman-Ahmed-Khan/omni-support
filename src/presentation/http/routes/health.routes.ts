import { Router } from 'express';
import { HealthController } from '../controllers/health.controller';

export function createHealthRouter(container: any): Router {
  const router = Router();
  const controller: HealthController = container.resolve('healthController');

  router.get('/', (req, res) => controller.full(req, res));
  router.get('/live', (req, res) => controller.liveness(req, res));
  router.get('/ready', (req, res) => controller.readiness(req, res));

  return router;
}
