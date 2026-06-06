import { Request, Response, NextFunction, RequestHandler } from 'express';
import { PrismaClient } from '@prisma/client';
import {
  ForbiddenError,
  UnauthorizedError,
} from '../../../shared/errors/application.error';
import { asyncHandler } from '../../../shared/utils/express.util';
import { mapPrismaTenantToEntity } from '../../../shared/mappers/tenant.mapper';
import { TenantActiveSpecification } from '../../../domain/specifications/tenant-active.specification';

export function createTenantMiddleware(prisma: PrismaClient): RequestHandler {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    // Platform admins are not tenant-scoped
    if (req.user.role === 'PLATFORM_ADMIN') {
      next();
      return;
    }

    const tenantId = req.user.tenantId;

    if (!tenantId) {
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
