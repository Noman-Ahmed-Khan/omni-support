import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { jwtConfig } from '../../../config/jwt.config';
import { UnauthorizedError } from '../../../shared/errors/application.error';
import { logger } from '../../../shared/utils/logger.util';

export interface AccessTokenPayload {
  sub: string;       // userId
  tenantId?: string;
  role: string;
  email: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  familyId: string;
  type: 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class TokenService {
  constructor(private readonly prisma: PrismaClient) {}

  generateAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
    const options: jwt.SignOptions = {
      expiresIn: jwtConfig.accessExpiresIn as jwt.SignOptions['expiresIn'],
      issuer: 'omnisupport',
      audience: 'omnisupport-api',
    };

    return jwt.sign(
      { ...payload, type: 'access' },
      jwtConfig.accessSecret,
      options,
    );
  }

  generateRefreshToken(userId: string, familyId: string): string {
    const options: jwt.SignOptions = {
      expiresIn: jwtConfig.refreshExpiresIn as jwt.SignOptions['expiresIn'],
      issuer: 'omnisupport',
      audience: 'omnisupport-api',
    };

    return jwt.sign(
      { sub: userId, familyId, type: 'refresh' },
      jwtConfig.refreshSecret,
      options,
    );
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      return jwt.verify(token, jwtConfig.accessSecret, {
        issuer: 'omnisupport',
        audience: 'omnisupport-api',
      }) as AccessTokenPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Access token expired');
      }
      throw new UnauthorizedError('Invalid access token');
    }
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      return jwt.verify(token, jwtConfig.refreshSecret, {
        issuer: 'omnisupport',
        audience: 'omnisupport-api',
      }) as RefreshTokenPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Refresh token expired');
      }
      throw new UnauthorizedError('Invalid refresh token');
    }
  }

  async createTokenPair(
    userId: string,
    payload: Omit<AccessTokenPayload, 'type' | 'sub'>,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<TokenPair> {
    const familyId = crypto.randomUUID();
    const refreshToken = this.generateRefreshToken(userId, familyId);
    const accessToken = this.generateAccessToken({ ...payload, sub: userId });

    // Hash and store refresh token
    const tokenHash = await argon2.hash(refreshToken, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const expiresAt = new Date(
      Date.now() + jwtConfig.refreshExpiresInMs,
    );

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        familyId,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
    };
  }

  async rotateRefreshToken(
    oldRefreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<TokenPair & { userId: string; tenantId?: string; role: string; email: string }> {
    const payload = this.verifyRefreshToken(oldRefreshToken);
    const { sub: userId, familyId } = payload;

    // Find the token family
    const storedTokens = await this.prisma.refreshToken.findMany({
      where: { familyId, userId },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });

    if (storedTokens.length === 0) {
      throw new UnauthorizedError('Refresh token not found');
    }

    // Check for token reuse (security: detect token theft)
    const revokedTokens = storedTokens.filter((t) => t.isRevoked);
    if (revokedTokens.length > 0) {
      // Token reuse detected - revoke entire family
      await this.revokeTokenFamily(familyId, 'TOKEN_REUSE_DETECTED');
      logger.warn('Token reuse detected - entire family revoked', {
        userId,
        familyId,
        ipAddress,
      });
      throw new UnauthorizedError('Token reuse detected. Please login again.');
    }

    // Find the active token and verify it
    const activeToken = storedTokens.find((t) => !t.isRevoked);
    if (!activeToken) {
      throw new UnauthorizedError('No active refresh token found');
    }

    if (activeToken.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token expired');
    }

    // Verify hash matches
    const isValid = await argon2.verify(
      activeToken.tokenHash,
      oldRefreshToken,
    );

    if (!isValid) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Revoke old token
    await this.prisma.refreshToken.update({
      where: { id: activeToken.id },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: 'ROTATED',
      },
    });

    const user = activeToken.user;

    // Issue new token pair
    const tokenPair = await this.createTokenPair(
      userId,
      {
        tenantId: user.tenantId ?? undefined,
        role: user.role,
        email: user.email,
      },
      ipAddress,
      userAgent,
    );

    return {
      ...tokenPair,
      userId,
      tenantId: user.tenantId ?? undefined,
      role: user.role,
      email: user.email,
    };
  }

  async revokeToken(refreshToken: string): Promise<void> {
    try {
      const payload = this.verifyRefreshToken(refreshToken);

      const storedToken = await this.prisma.refreshToken.findFirst({
        where: {
          userId: payload.sub,
          familyId: payload.familyId,
          isRevoked: false,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (storedToken) {
        await this.prisma.refreshToken.update({
          where: { id: storedToken.id },
          data: {
            isRevoked: true,
            revokedAt: new Date(),
            revokedReason: 'LOGOUT',
          },
        });
      }
    } catch {
      // Token may already be invalid - that's fine for logout
    }
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: 'REVOKED_ALL',
      },
    });
  }

  private async revokeTokenFamily(
    familyId: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
  }

  async cleanupExpiredTokens(): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }

  generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  hashToken(token: string): Promise<string> {
    return Promise.resolve(
      crypto.createHash('sha256').update(token).digest('hex'),
    );
  }
}
