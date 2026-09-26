import crypto from 'crypto';

import type { PrismaClient, RefreshToken, User } from '@prisma/client';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';

import { getJwtConfig, JWT_AUDIENCE, JWT_ISSUER } from '../../../config/jwt.config';
import { SecretsService } from '../../../infrastructure/security/secrets.service';
import { TokenSigningService } from '../../../infrastructure/security/token-signing.service';
import {
  ForbiddenError,
  UnauthorizedError,
} from '../../../shared/errors/application.error';
import { sha256 } from '../../../shared/utils/crypto.util';
import { logger } from '../../../shared/utils/logger.util';

export interface AccessTokenPayload {
  sub: string; // userId
  tenantId?: string;
  role: string;
  email: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  familyId: string;
  type: 'refresh';
  jti?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * A second refresh with an already-rotated token inside this window is treated as a
 * client race (e.g. two browser tabs) and rejected without revoking the session.
 */
const ROTATION_GRACE_MS = 10_000;

const BLOCKED_TENANT_STATUSES = new Set(['SUSPENDED', 'CANCELLED']);

type AccountState = Pick<User, 'id' | 'status' | 'lockedUntil' | 'tenantId'>;

export class TokenService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tokenSigningService: TokenSigningService = new TokenSigningService(),
    private readonly secretsService: SecretsService = new SecretsService(),
  ) {}

  generateAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
    const options: jwt.SignOptions = {
      expiresIn: getJwtConfig().accessExpiresIn as jwt.SignOptions['expiresIn'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    };

    return this.tokenSigningService.sign(
      { ...payload, type: 'access' },
      this.secretsService.getJwtAccessSecret(),
      options,
    );
  }

  generateRefreshToken(userId: string, familyId: string, tokenId?: string): string {
    const options: jwt.SignOptions = {
      expiresIn: getJwtConfig().refreshExpiresIn as jwt.SignOptions['expiresIn'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      ...(tokenId ? { jwtid: tokenId } : {}),
    };

    return this.tokenSigningService.sign(
      { sub: userId, familyId, type: 'refresh' },
      this.secretsService.getJwtRefreshSecret(),
      options,
    );
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    let payload: AccessTokenPayload;
    try {
      payload = this.tokenSigningService.verify<AccessTokenPayload>(
        token,
        this.secretsService.getJwtAccessSecret(),
        { issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
      );
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Access token expired');
      }
      throw new UnauthorizedError('Invalid access token');
    }

    if (payload.type !== 'access') {
      throw new UnauthorizedError('Invalid access token');
    }

    return payload;
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    let payload: RefreshTokenPayload;
    try {
      payload = this.tokenSigningService.verify<RefreshTokenPayload>(
        token,
        this.secretsService.getJwtRefreshSecret(),
        { issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
      );
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Refresh token expired');
      }
      throw new UnauthorizedError('Invalid refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedError('Invalid refresh token');
    }

    return payload;
  }

  /**
   * Issues a new access/refresh pair. Pass `familyId` when rotating so the new token
   * stays in the same session family and reuse detection can revoke the whole chain.
   */
  async createTokenPair(
    userId: string,
    payload: Omit<AccessTokenPayload, 'type' | 'sub'>,
    ipAddress?: string,
    userAgent?: string,
    familyId: string = crypto.randomUUID(),
  ): Promise<TokenPair> {
    const tokenId = crypto.randomUUID();
    const refreshToken = this.generateRefreshToken(userId, familyId, tokenId);
    const accessToken = this.generateAccessToken({ ...payload, sub: userId });

    const tokenHash = await argon2.hash(refreshToken, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const expiresAt = new Date(Date.now() + getJwtConfig().refreshExpiresInMs);

    await this.prisma.refreshToken.create({
      data: {
        id: tokenId,
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
      expiresIn: getJwtConfig().accessExpiresInSeconds,
    };
  }

  async rotateRefreshToken(
    oldRefreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<
    TokenPair & { userId: string; tenantId?: string; role: string; email: string }
  > {
    const payload = this.verifyRefreshToken(oldRefreshToken);
    const { sub: userId, familyId } = payload;

    const storedToken = payload.jti
      ? await this.findTokenById(payload.jti, userId, familyId)
      : await this.findLegacyActiveToken(userId, familyId);

    if (!storedToken) {
      throw new UnauthorizedError('Refresh token not found');
    }

    if (storedToken.isRevoked) {
      await this.handleRevokedTokenUse(storedToken, ipAddress);
    }

    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token expired');
    }

    const isValid = await argon2.verify(storedToken.tokenHash, oldRefreshToken);
    if (!isValid) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Atomic claim: only one concurrent request can rotate a given token.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: storedToken.id, isRevoked: false },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: 'ROTATED',
      },
    });

    if (claimed.count !== 1) {
      throw new UnauthorizedError('Refresh token already used');
    }

    const user = storedToken.user;

    try {
      await this.assertAccountUsable(user);
    } catch (error) {
      await this.revokeTokenFamily(familyId, 'ACCOUNT_NOT_USABLE');
      throw error;
    }

    const tokenPair = await this.createTokenPair(
      userId,
      {
        tenantId: user.tenantId ?? undefined,
        role: user.role,
        email: user.email,
      },
      ipAddress,
      userAgent,
      familyId,
    );

    return {
      ...tokenPair,
      userId,
      tenantId: user.tenantId ?? undefined,
      role: user.role,
      email: user.email,
    };
  }

  /**
   * Throws when the user (or their organization) may no longer obtain tokens.
   */
  async assertAccountUsable(user: AccountState): Promise<void> {
    if (user.status === 'SUSPENDED' || user.status === 'INACTIVE') {
      throw new ForbiddenError('Your account is not active');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedError('Account is temporarily locked');
    }

    if (user.tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { status: true },
      });

      if (!tenant || BLOCKED_TENANT_STATUSES.has(tenant.status)) {
        throw new ForbiddenError('Your organization account is not active');
      }
    }
  }

  /**
   * Revokes the session (token family) the given refresh token belongs to.
   */
  async revokeToken(refreshToken: string): Promise<void> {
    let payload: RefreshTokenPayload;
    try {
      payload = this.verifyRefreshToken(refreshToken);
    } catch {
      // Token may already be invalid - that's fine for logout
      return;
    }

    await this.prisma.refreshToken.updateMany({
      where: { userId: payload.sub, familyId: payload.familyId, isRevoked: false },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: 'LOGOUT',
      },
    });
  }

  async revokeAllUserTokens(
    userId: string,
    reason: string = 'REVOKED_ALL',
  ): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
  }

  async revokeAllTenantTokens(tenantId: string, reason: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { user: { tenantId }, isRevoked: false },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
  }

  private async revokeTokenFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, isRevoked: false },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
  }

  private async handleRevokedTokenUse(
    token: RefreshToken,
    ipAddress?: string,
  ): Promise<never> {
    const recentlyRotated =
      token.revokedReason === 'ROTATED' &&
      token.revokedAt !== null &&
      Date.now() - token.revokedAt.getTime() < ROTATION_GRACE_MS;

    if (recentlyRotated) {
      throw new UnauthorizedError('Refresh token already used');
    }

    await this.revokeTokenFamily(token.familyId, 'TOKEN_REUSE_DETECTED');
    logger.warn('Refresh token reuse detected - session family revoked', {
      userId: token.userId,
      familyId: token.familyId,
      ipAddress,
    });
    throw new UnauthorizedError('Token reuse detected. Please login again.');
  }

  private async findTokenById(
    tokenId: string,
    userId: string,
    familyId: string,
  ): Promise<(RefreshToken & { user: User }) | null> {
    const token = await this.prisma.refreshToken.findUnique({
      where: { id: tokenId },
      include: { user: true },
    });

    if (!token || token.userId !== userId || token.familyId !== familyId) {
      return null;
    }

    return token;
  }

  /**
   * Tokens issued before refresh tokens carried a `jti` are matched to the newest
   * active token of their family.
   */
  private async findLegacyActiveToken(
    userId: string,
    familyId: string,
  ): Promise<(RefreshToken & { user: User }) | null> {
    const tokens = await this.prisma.refreshToken.findMany({
      where: { familyId, userId },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });

    if (tokens.length === 0) return null;

    return tokens.find((t) => !t.isRevoked) ?? tokens[0];
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
    return Promise.resolve(sha256(token));
  }
}
