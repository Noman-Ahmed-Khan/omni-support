import { Request, Response, NextFunction } from 'express';
import { BaseError } from '../../../shared/errors/base.error';
import { ValidationError } from '../../../shared/errors/domain.error';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '../../../shared/utils/logger.util';

export function errorHandlerMiddleware(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const correlationId = req.correlationId;
  const tenantId = req.user?.tenantId;

  // Handle our custom errors
  if (error instanceof BaseError) {
    if (!error.isOperational) {
      logger.error('Non-operational error', {
        error: error.message,
        stack: error.stack,
        correlationId,
        tenantId,
      });
    } else {
      logger.warn('Operational error', {
        errorCode: error.errorCode,
        message: error.message,
        correlationId,
        tenantId,
      });
    }

    const response: Record<string, unknown> = {
      type: `https://omnisupport.io/errors/${error.errorCode
        .toLowerCase()
        .replace(/_/g, '-')}`,
      title: getTitleFromCode(error.errorCode),
      status: error.statusCode,
      detail: error.message,
      correlationId,
      timestamp: new Date().toISOString(),
    };

    // Include validation errors if present
    if (error instanceof ValidationError && error.errors) {
      response.errors = error.errors;
    }

    res.status(error.statusCode).json(response);
    return;
  }

  // Handle Zod errors that escaped validation middleware
  if (error instanceof ZodError) {
    const errors: Record<string, string[]> = {};
    error.errors.forEach((e) => {
      const path = e.path.join('.');
      if (!errors[path]) errors[path] = [];
      errors[path].push(e.message);
    });

    res.status(400).json({
      type: 'https://omnisupport.io/errors/validation-error',
      title: 'Validation Error',
      status: 400,
      detail: 'Request validation failed',
      errors,
      correlationId,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Handle Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      res.status(409).json({
        type: 'https://omnisupport.io/errors/conflict',
        title: 'Conflict',
        status: 409,
        detail: 'A record with this data already exists',
        correlationId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (error.code === 'P2025') {
      res.status(404).json({
        type: 'https://omnisupport.io/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: 'The requested record was not found',
        correlationId,
        timestamp: new Date().toISOString(),
      });
      return;
    }
  }

  // Handle CORS errors
  if (error.message?.includes('CORS')) {
    res.status(403).json({
      type: 'https://omnisupport.io/errors/forbidden',
      title: 'CORS Error',
      status: 403,
      detail: 'Cross-origin request not allowed',
      correlationId,
    });
    return;
  }

  // Unknown/unexpected errors
  logger.error('Unexpected error', {
    error: error.message,
    stack: error.stack,
    correlationId,
    tenantId,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    type: 'https://omnisupport.io/errors/internal-server-error',
    title: 'Internal Server Error',
    status: 500,
    detail:
      process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred. Please try again later.'
        : error.message,
    correlationId,
    timestamp: new Date().toISOString(),
  });
}

function getTitleFromCode(code: string): string {
  const titles: Record<string, string> = {
    NOT_FOUND: 'Not Found',
    CONFLICT: 'Conflict',
    VALIDATION_ERROR: 'Validation Error',
    UNAUTHORIZED: 'Unauthorized',
    FORBIDDEN: 'Forbidden',
    DOMAIN_ERROR: 'Business Rule Violation',
    INFRASTRUCTURE_ERROR: 'Service Error',
    RATE_LIMIT_EXCEEDED: 'Too Many Requests',
    TENANT_SUSPENDED: 'Account Suspended',
  };

  return titles[code] ?? 'Error';
}