import type { IncomingMessage } from 'http';

import type { AccessTokenPayload } from '../../application/auth/services/token.service';
import { getJwtConfig, JWT_AUDIENCE, JWT_ISSUER } from '../../config/jwt.config';
import { logger } from '../../shared/utils/logger.util';
import { extractBearerTokenFromWebSocketRequest } from '../../shared/utils/token.util';
import { TokenSigningService } from '../security/token-signing.service';

export interface WSAuthResult {
  userId: string;
  email: string;
  tenantId?: string;
  role: string;
}

export class WebSocketAuth {
  constructor(
    private readonly tokenSigningService: TokenSigningService = new TokenSigningService(),
  ) {}

  authenticate(request: IncomingMessage): Promise<WSAuthResult | null> {
    try {
      const token = extractBearerTokenFromWebSocketRequest(request);

      if (!token) return Promise.resolve(null);

      const payload = this.tokenSigningService.verify<AccessTokenPayload>(
        token,
        getJwtConfig().accessSecret,
        { issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
      );

      if (payload.type !== 'access') {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        userId: payload.sub,
        email: payload.email,
        tenantId: payload.tenantId,
        role: payload.role,
      });
    } catch (error) {
      logger.warn('WebSocket authentication failed', { error });
      return Promise.resolve(null);
    }
  }
}
