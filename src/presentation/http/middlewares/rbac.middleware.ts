import { Request, Response, NextFunction, RequestHandler } from 'express';
import { PrismaClient } from '@prisma/client';
import { PermissionCacheStrategy } from '../../../infrastructure/cache/strategies/permission.cache';
import { ForbiddenError, UnauthorizedError } from '../../../shared/errors/application.error';
import { logger } from '../../../shared/utils/logger.util';

export function requirePermission(resource: string, action: string) {
  return function permissionMiddleware(
    _prisma: PrismaClient,
    _permissionCache: PermissionCacheStrategy,
  ): RequestHandler {
    return (
      req: Request,
      _res: Response,
      next: NextFunction,
    ): void => {
      void (async (): Promise<void> => {
        if (!req.user) {
          throw new UnauthorizedError('Authentication required');
        }

        const hasPermission = await checkUserPermission(
          req.user.id,
          req.user.role,
          resource,
          action,
          _prisma,
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

          throw new ForbiddenError(
            `You don't have permission to ${action} ${resource}`,
          );
        }

        next();
      })().catch(next);
    };
  };
}

export function requireRole(...roles: string[]): RequestHandler {
  return (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): void => {
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

async function checkUserPermission(
  userId: string,
  role: string,
  resource: string,
  action: string,
  prisma: PrismaClient,
  permissionCache: PermissionCacheStrategy,
): Promise<boolean> {
  // Check cache first
  const cached = await permissionCache.getPermissions(userId);

  if (cached) {
    return cached.permissions.includes(`${resource}:${action}`);
  }

  // Load from DB
  const systemRole = await prisma.role.findFirst({
    where: { name: role, tenantId: null },
    include: {
      permissions: {
        include: { permission: true },
      },
    },
  });

  if (!systemRole) return false;

  const permissions = systemRole.permissions.map(
    (rp) => `${rp.permission.resource}:${rp.permission.action}`,
  );

  // Cache permissions
  await permissionCache.setPermissions({
    userId,
    role,
    permissions,
    cachedAt: Date.now(),
  });

  return permissions.includes(`${resource}:${action}`);
}
