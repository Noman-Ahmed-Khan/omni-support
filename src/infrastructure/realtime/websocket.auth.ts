import type { IncomingMessage } from 'http';

import jwt from 'jsonwebtoken';

import type { AccessTokenPayload } from '../../application/auth/services/token.service';
import { jwtConfig } from '../../config/jwt.config';
import { logger } from '../../shared/utils/logger.util';
import { extractBearerTokenFromWebSocketRequest } from '../../shared/utils/token.util';

export interface WSAuthResult {
  userId: string;
  tenantId?: string;
  role: string;
}

export class WebSocketAuth {
  authenticate(request: IncomingMessage): Promise<WSAuthResult | null> {
    try {
      const token = extractBearerTokenFromWebSocketRequest(request);

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
}
