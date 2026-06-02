import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { json, urlencoded } from 'express';
import { Container } from '../../container';
import { appConfig } from '../../config/app.config';
import { correlationMiddleware } from './middlewares/correlation.middleware';
import { rateLimitMiddleware } from './middlewares/rate-limit.middleware';
import { sanitizeMiddleware } from './middlewares/sanitize.middleware';
import { errorHandlerMiddleware } from './middlewares/error-handler.middleware';
import { createV1Router } from './routes/v1';
import { createHealthRouter } from './routes/health.routes';
import { logger } from '../../shared/utils/logger.util';

export function createApp(container: Container): Application {
  const app = express();

  // Security Headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: true,
      crossOriginOpenerPolicy: true,
      crossOriginResourcePolicy: { policy: 'same-site' },
      dnsPrefetchControl: true,
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      ieNoOpen: true,
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xssFilter: true,
    }),
  );

  // CORS
  const allowedOrigins = appConfig.corsOrigins.split(',').map((o) => o.trim());

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS blocked: ${origin}`));
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

  // Compression
  app.use(compression());

  // Request ID & Correlation
  app.use(correlationMiddleware);

  // Input Sanitization 
  app.use(sanitizeMiddleware);

  // Rate Limiting (global)
  app.use(rateLimitMiddleware);

  // Trust Proxy (for AWS ALB/NLB)
  app.set('trust proxy', 1);

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

  // Health Routes (no auth)
  app.use('/health', createHealthRouter(container));

  // API v1 Routes
  app.use(appConfig.apiPrefix, createV1Router(container));

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
  }
}