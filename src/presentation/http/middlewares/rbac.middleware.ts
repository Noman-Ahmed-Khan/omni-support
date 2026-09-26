import type { Request, Response, NextFunction, RequestHandler } from 'express';

import {
  ForbiddenError,
  UnauthorizedError,
} from '../../../shared/errors/application.error';

/**
 * Role-based access control. Row-level rules (which tickets a user may see) are
 * enforced by policies in the application layer, e.g. TicketAccessPolicy.
 */
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
