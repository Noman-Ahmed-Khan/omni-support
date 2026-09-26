import type { PrismaClient } from '@prisma/client';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

import { TenantActiveSpecification } from '../../../domain/specifications/tenant-active.specification';
import { mapPrismaTenantToEntity } from '../../../infrastructure/database/mappers/tenant.mapper';
import {
  ForbiddenError,
  UnauthorizedError,
} from '../../../shared/errors/application.error';
import { asyncHandler } from '../utils/async-handler';

export interface TenantMiddlewareOptions {
  /**
   * Allow authenticated users that do not belong to any organization to pass through
   * (e.g. for "/me" endpoints). Tenant users are still checked for an active tenant.
   */
  allowTenantless?: boolean;
}

export function createTenantMiddleware(
  prisma: PrismaClient,
  options: TenantMiddlewareOptions = {},
): RequestHandler {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    // Platform admins are not tenant-scoped
    if (req.user.role === 'PLATFORM_ADMIN') {
      req.tenantId = undefined;
      next();
      return;
    }

    const tenantId = req.user.tenantId;

    if (!tenantId) {
      if (options.allowTenantless) {
        req.tenantId = undefined;
        next();
        return;
      }
      throw new ForbiddenError('User is not associated with any organization');
    }

    // Verify tenant is active
    const tenantRecord = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenantRecord) {
      throw new ForbiddenError('Organization not found');
    }

    const tenant = mapPrismaTenantToEntity(tenantRecord);
    const activeSpecification = new TenantActiveSpecification();

    if (!activeSpecification.isSatisfiedBy(tenant)) {
      if (tenant.status === 'SUSPENDED') {
        throw new ForbiddenError(
          'Your organization has been suspended. Please contact support.',
        );
      }

      if (tenant.status === 'CANCELLED') {
        throw new ForbiddenError('Your organization account has been cancelled');
      }

      throw new ForbiddenError('Your organization is not active');
    }

    req.tenantId = tenantId;

    next();
  });
}

/**
 * Rejects requests that have no tenant context. Use on routes that must operate on a
 * single organization's data, so a missing tenantId can never turn into an unscoped query
 * (platform admins are not tenant members and cannot use these routes).
 */
export function requireTenantContext(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.tenantId) {
    next(new ForbiddenError('This action requires an organization context'));
    return;
  }
  next();
}
