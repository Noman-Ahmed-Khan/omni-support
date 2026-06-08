import type { PrismaClient } from '@prisma/client';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

import { AuthorizationService } from '../../../application/authorization/authorization.service';
import type { PermissionCacheStrategy } from '../../../infrastructure/cache/strategies/permission.cache';
import {
  ForbiddenError,
  UnauthorizedError,
} from '../../../shared/errors/application.error';
import { asyncHandler } from '../../../shared/utils/express.util';
import { logger } from '../../../shared/utils/logger.util';

export function requirePermission(resource: string, action: string) {
  return function permissionMiddleware(
    _prisma: PrismaClient,
    _permissionCache: PermissionCacheStrategy,
  ): RequestHandler {
    return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const authorizationService = new AuthorizationService(_prisma);
      const hasPermission = await authorizationService.hasPermission(
        {
          userId: req.user.id,
          role: req.user.role,
          tenantId: req.user.tenantId,
        },
        resource,
        action,
        _permissionCache,
      );

      if (!hasPermission) {
        logger.warn('Permission denied', {
          userId: req.user.id,
          role: req.user.role,
          resource,
          action,
          correlationId: req.correlationId,
        });

        throw new ForbiddenError(`You don't have permission to ${action} ${resource}`);
      }

      next();
    });
  };
}

export function requireRole(...roles: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      if (!roles.includes(req.user.role)) {
        throw new ForbiddenError(
          `This action requires one of these roles: ${roles.join(', ')}`,
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
