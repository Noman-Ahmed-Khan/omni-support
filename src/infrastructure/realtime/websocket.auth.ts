import type { IncomingMessage } from 'http';

import type { PrismaClient } from '@prisma/client';

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
    private readonly prisma?: PrismaClient,
  ) {}

  async authenticate(request: IncomingMessage): Promise<WSAuthResult | null> {
    try {
      const token = extractBearerTokenFromWebSocketRequest(request);

      if (!token) return null;

      const payload = this.tokenSigningService.verify<AccessTokenPayload>(
        token,
        getJwtConfig().accessSecret,
        { issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
      );

      if (payload.type !== 'access') {
        return null;
      }

      if (this.prisma) {
        const user = await this.prisma.user.findUnique({
          where: { id: payload.sub },
          select: { email: true, role: true, tenantId: true, status: true },
        });
        if (
          !user ||
          user.status !== 'ACTIVE' ||
          user.email !== payload.email ||
          user.role !== payload.role ||
          (user.tenantId ?? undefined) !== payload.tenantId
        ) {
          return null;
        }
        if (!(await this.isTenantUsable(user.tenantId))) return null;
      }

      return {
        userId: payload.sub,
        email: payload.email,
        tenantId: payload.tenantId,
        role: payload.role,
      };
    } catch (error) {
      logger.warn('WebSocket authentication failed', { error });
      return null;
    }
  }

  async isStillAuthorized(client: WSAuthResult): Promise<boolean> {
    if (!this.prisma) return true;
    const user = await this.prisma.user.findUnique({
      where: { id: client.userId },
      select: { email: true, role: true, tenantId: true, status: true },
    });
    return (
      !!user &&
      user.status === 'ACTIVE' &&
      user.email === client.email &&
      user.role === client.role &&
      (user.tenantId ?? undefined) === client.tenantId &&
      (await this.isTenantUsable(user.tenantId))
    );
  }

  private async isTenantUsable(tenantId: string | null): Promise<boolean> {
    if (!tenantId || !this.prisma) return true;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true },
    });
    return !!tenant && tenant.status !== 'SUSPENDED' && tenant.status !== 'CANCELLED';
  }
}
