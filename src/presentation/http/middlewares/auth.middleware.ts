import type { Request, Response, NextFunction } from 'express';

import type { TokenService } from '../../../application/auth/services/token.service';
import { UnauthorizedError } from '../../../shared/errors/application.error';
import { extractBearerTokenFromRequest } from '../../../shared/utils/token.util';
import { asyncHandler } from '../utils/async-handler';

export function createAuthMiddleware(tokenService: TokenService) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const token = extractBearerTokenFromRequest(req);

    if (!token) {
      throw new UnauthorizedError('No authentication token provided');
    }

    const payload = tokenService.verifyAccessToken(token);
    await tokenService.assertAccessTokenUsable(payload);

    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId,
    };

    req.tenantId = payload.tenantId;

    next();
  });
}

export function createOptionalAuthMiddleware(tokenService: TokenService) {
  return function optionalAuthMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): void {
    try {
      const token = extractBearerTokenFromRequest(req);

      if (token) {
        const payload = tokenService.verifyAccessToken(token);
        req.user = {
          id: payload.sub,
          email: payload.email,
          role: payload.role,
          tenantId: payload.tenantId,
        };
        req.tenantId = payload.tenantId;
      }
    } catch {
      // Optional auth - ignore errors
    }

    next();
  };
}
