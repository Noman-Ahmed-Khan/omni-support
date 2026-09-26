import crypto from 'crypto';

import { Router } from 'express';

import type { HealthController } from './controllers/health.controller';
import { createHealthRouter } from './routes/health.routes';
import { createV1Router } from './routes/v1';
import { getAppConfig } from '../../config/app.config';
import type { Container } from '../../shared/di/container';

export function createApplicationRouter(container: Container): Router {
  const router = Router();
  const healthController: HealthController = container.resolve('healthController');

  // Health Routes (no auth)
  router.use('/health', createHealthRouter(container));

  // Prometheus metrics: bearer METRICS_TOKEN when configured; disabled in production
  // without a token so internal figures are never public by accident.
  router.get('/metrics', (req, res, next) => {
    const { metricsToken, env } = getAppConfig();

    if (!metricsToken) {
      if (env === 'production') {
        next();
        return;
      }
    } else if (!hasBearerToken(req.headers.authorization, metricsToken)) {
      res.status(401).json({
        type: 'https://omnisupport.io/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'A valid metrics token is required',
      });
      return;
    }

    healthController.metrics(req, res).catch(next);
  });

  // API v1 Routes
  router.use(getAppConfig().apiPrefix, createV1Router(container));

  // Unmatched routes fall through to the 404 handler in app.ts.

  return router;
}

function hasBearerToken(header: string | undefined, expected: string): boolean {
  const supplied = Buffer.from(header?.replace(/^Bearer\s+/i, '') ?? '');
  const wanted = Buffer.from(expected);
  return supplied.length === wanted.length && crypto.timingSafeEqual(supplied, wanted);
}
