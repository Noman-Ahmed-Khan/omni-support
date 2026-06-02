import { IncomingMessage } from 'http';
import { parse } from 'url';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../../config/jwt.config';
import { logger } from '../../shared/utils/logger.util';
import { AccessTokenPayload } from '../../application/auth/services/token.service';

export interface WSAuthResult {
  userId: string;
  tenantId?: string;
  role: string;
}

export class WebSocketAuth {
  authenticate(request: IncomingMessage): Promise<WSAuthResult | null> {
    try {
      const token = this.extractToken(request);

      if (!token) return Promise.resolve(null);

      const payload = jwt.verify(token, jwtConfig.accessSecret) as AccessTokenPayload;

      return Promise.resolve({
        userId: payload.sub,
        tenantId: payload.tenantId,
        role: payload.role,
      });
    } catch (error) {
      logger.warn('WebSocket authentication failed', { error });
      return Promise.resolve(null);
    }
  }

  private extractToken(request: IncomingMessage): string | null {
    // Try query param first (WebSocket standard)
    const { query } = parse(request.url ?? '', true);
    if (query.token) return query.token as string;

    // Try Authorization header
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Try cookie
    const cookies = this.parseCookies(request.headers.cookie ?? '');
    return cookies['access_token'] ?? null;
  }

  private parseCookies(cookieHeader: string): Record<string, string> {
    return cookieHeader.split(';').reduce(
      (acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        if (key) acc[key.trim()] = value?.trim() ?? '';
        return acc;
      },
      {} as Record<string, string>,
    );
  }
}
