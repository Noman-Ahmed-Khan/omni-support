import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import type { Application } from 'express';
import express, { json, urlencoded } from 'express';

import { correlationMiddleware } from './middlewares/correlation.middleware';
import { errorHandlerMiddleware } from './middlewares/error-handler.middleware';
import { createRateLimitMiddleware } from './middlewares/rate-limit.middleware';
import { sanitizeMiddleware } from './middlewares/sanitize.middleware';
import { createApplicationRouter } from './router';
import { createSwaggerRouter } from './swagger';
import { getAppConfig, resolveTrustProxy } from '../../config/app.config';
import { createMetricsMiddleware } from '../../infrastructure/observability/metrics/metrics.middleware';
import type { MetricsService } from '../../infrastructure/observability/metrics/metrics.service';
import { createTracingMiddleware } from '../../infrastructure/observability/tracing/tracing.middleware';
import type { TracingService } from '../../infrastructure/observability/tracing/tracing.service';
import { createSecurityHeaders } from '../../infrastructure/security/security-headers';
import type { Container } from '../../shared/di/container';
import { ForbiddenError } from '../../shared/errors/application.error';
import { logger } from '../../shared/utils/logger.util';

export function createApp(container: Container): Application {
  const app = express();
  const metricsService: MetricsService = container.resolve('metricsService');
  const tracingService: TracingService = container.resolve('tracingService');

  // Trust Proxy: must be set before anything reads req.ip (rate limiting, logging).
  // Only trust forwarding headers when a known proxy sits in front of the app.
  app.set('trust proxy', resolveTrustProxy(getAppConfig().trustProxy));

  // Security Headers
  app.use(createSecurityHeaders());

  // CORS
  const allowedOrigins = getAppConfig()
    .corsOrigins.split(',')
    .map((o) => o.trim());

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new ForbiddenError('Cross-origin request not allowed'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Correlation-ID',
        'X-Tenant-ID',
      ],
      exposedHeaders: ['X-Correlation-ID', 'X-RateLimit-Remaining'],
      maxAge: 86400,
    }),
  );

  // Body Parsing
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // Compression
  app.use(compression());

  // Request ID & Correlation
  app.use(correlationMiddleware);
  app.use(createTracingMiddleware(tracingService));
  app.use(createMetricsMiddleware(metricsService));

  // Input Sanitization
  app.use(sanitizeMiddleware);

  // Rate Limiting (global)
  app.use(createRateLimitMiddleware());

  // Request Logging
  app.use((req, _res, next) => {
    logger.info('Incoming request', {
      method: req.method,
      path: req.path,
      correlationId: req.correlationId,
      tenantId: req.headers['x-tenant-id'],
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    next();
  });

  // Application Routes
  app.use('/', createSwaggerRouter(getAppConfig().enableApiDocs));
  app.use('/', createApplicationRouter(container));

  // 404 Handler
  app.use((_req, res) => {
    res.status(404).json({
      type: 'https://omnisupport.io/errors/not-found',
      title: 'Not Found',
      status: 404,
      detail: 'The requested resource was not found',
    });
  });

  // Global Error Handler
  app.use(errorHandlerMiddleware);

  return app;
}

// Extend Express Request type via module augmentation
declare module 'express-serve-static-core' {
  interface Request {
    correlationId: string;
    user?: {
      id: string;
      email: string;
      role: string;
      tenantId?: string;
    };
    tenantId?: string;
    /** Effective permissions, resolved once per request by requirePermission. */
    permissions?: ReadonlySet<string>;
  }
}
