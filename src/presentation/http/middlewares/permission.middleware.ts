import type { Request, RequestHandler } from 'express';

import type { PermissionService } from '../../../application/auth/services/permission.service';
import type { Permission } from '../../../domain/policies/permission.catalog';
import {
  ForbiddenError,
  UnauthorizedError,
} from '../../../shared/errors/application.error';
import { asyncHandler } from '../utils/async-handler';

export async function resolvePermissions(
  service: PermissionService,
  req: Request,
): Promise<ReadonlySet<string>> {
  if (!req.user) throw new UnauthorizedError('Authentication required');
  if (!req.permissions) {
    req.permissions = await service.getEffectivePermissions(req.user);
  }
  return req.permissions;
}

/**
 * Permission-based access control. Passes when the caller holds any of the given
 * permissions. Row-level rules (which tickets a user may see) stay in the application
 * layer, e.g. TicketAccessPolicy.
 */
export function createPermissionGuard(service: PermissionService) {
  return (...permissions: Permission[]): RequestHandler =>
    asyncHandler(async (req, _res, next) => {
      const granted = await resolvePermissions(service, req);
      if (!permissions.some((permission) => granted.has(permission))) {
        throw new ForbiddenError(
          `This action requires the ${permissions.join(' or ')} permission`,
        );
      }
      next();
    });
}
