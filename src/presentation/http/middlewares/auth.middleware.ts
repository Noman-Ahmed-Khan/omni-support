import { Request, Response, NextFunction } from 'express';
import { TokenService } from '../../../application/auth/services/token.service';
import { UnauthorizedError } from '../../../shared/errors/application.error';

export function createAuthMiddleware(tokenService: TokenService) {
  return function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
    try {
      const token = extractBearerToken(req);

      if (!token) {
        throw new UnauthorizedError('No authentication token provided');
      }

      const payload = tokenService.verifyAccessToken(token);

      req.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        tenantId: payload.tenantId,
      };

      req.tenantId = payload.tenantId;

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function createOptionalAuthMiddleware(tokenService: TokenService) {
  return function optionalAuthMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): void {
    try {
      const token = extractBearerToken(req);

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

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}
