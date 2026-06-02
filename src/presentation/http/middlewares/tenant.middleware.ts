import { Request, Response, NextFunction, RequestHandler } from 'express';
import { PrismaClient } from '@prisma/client';
import { ForbiddenError, UnauthorizedError } from '../../../shared/errors/application.error';

export function createTenantMiddleware(prisma: PrismaClient): RequestHandler {
  return function tenantMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): void {
    void (async (): Promise<void> => {
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
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, status: true, name: true },
      });

      if (!tenant) {
        throw new ForbiddenError('Organization not found');
      }

      if (tenant.status === 'SUSPENDED') {
        throw new ForbiddenError(
          'Your organization has been suspended. Please contact support.',
        );
      }

      if (tenant.status === 'CANCELLED') {
        throw new ForbiddenError('Your organization account has been cancelled');
      }

      req.tenantId = tenantId;

      next();
    })().catch(next);
  };
}
