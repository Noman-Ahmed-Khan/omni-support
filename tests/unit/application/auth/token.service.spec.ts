import type { PrismaClient } from '@prisma/client';
import type { MockProxy } from 'jest-mock-extended';
import { mockDeep } from 'jest-mock-extended';
import jwt from 'jsonwebtoken';

import { TokenService } from '../../../../src/application/auth/services/token.service';
import { _resetJwtConfig } from '../../../../src/config/jwt.config';
import {
  ForbiddenError,
  UnauthorizedError,
} from '../../../../src/shared/errors/application.error';

const ACCESS_SECRET = 'unit_test_access_secret_minimum_32_characters';
const REFRESH_SECRET = 'unit_test_refresh_secret_minimum_32_characters';

type StoredToken = {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  isRevoked: boolean;
  revokedAt: Date | null;
  revokedReason: string | null;
  expiresAt: Date;
  user: {
    id: string;
    email: string;
    role: string;
    tenantId: string | null;
    status: string;
    lockedUntil: Date | null;
  };
};

describe('TokenService', () => {
  let prisma: MockProxy<PrismaClient>;
  let service: TokenService;

  const user = {
    id: 'user-1',
    email: 'agent@example.com',
    role: 'AGENT',
    tenantId: 'tenant-1',
    status: 'ACTIVE',
    lockedUntil: null,
  };

  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = ACCESS_SECRET;
    process.env.JWT_REFRESH_SECRET = REFRESH_SECRET;
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '30d';
    _resetJwtConfig();
  });

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    service = new TokenService(prisma);
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ status: 'ACTIVE' });
  });

  /** Issues a real token pair and returns the row that would have been stored. */
  async function issue(
    familyId?: string,
  ): Promise<{ refreshToken: string; stored: StoredToken }> {
    let createdData: {
      id: string;
      familyId: string;
      tokenHash: string;
      expiresAt: Date;
    } | null = null;
    (prisma.refreshToken.create as jest.Mock).mockImplementationOnce(
      (args: { data: typeof createdData }) => {
        createdData = args.data;
        return Promise.resolve(args.data);
      },
    );

    const pair = await service.createTokenPair(
      user.id,
      { tenantId: user.tenantId, role: user.role, email: user.email },
      undefined,
      undefined,
      familyId,
    );

    const data = createdData!;
    return {
      refreshToken: pair.refreshToken,
      stored: {
        id: data.id,
        userId: user.id,
        familyId: data.familyId,
        tokenHash: data.tokenHash,
        isRevoked: false,
        revokedAt: null,
        revokedReason: null,
        expiresAt: data.expiresAt,
        user: { ...user },
      },
    };
  }

  it('reports the configured access token lifetime', async () => {
    const pair = await service.createTokenPair(user.id, {
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    });
    expect(pair.expiresIn).toBe(15 * 60);
  });

  it('embeds the stored token id as jti and keeps a supplied family id', async () => {
    const { refreshToken, stored } = await issue('family-1');
    const decoded = jwt.decode(refreshToken) as { jti: string; familyId: string };

    expect(decoded.jti).toBe(stored.id);
    expect(decoded.familyId).toBe('family-1');
    expect(stored.familyId).toBe('family-1');
  });

  it('rotates a valid token inside the same family', async () => {
    const { refreshToken, stored } = await issue('family-1');
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(stored);
    (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const { stored: next } = await (async () => {
      let newRow: { familyId: string } | null = null;
      (prisma.refreshToken.create as jest.Mock).mockImplementationOnce(
        (args: { data: { familyId: string } }) => {
          newRow = args.data;
          return Promise.resolve(args.data);
        },
      );
      const result = await service.rotateRefreshToken(refreshToken);
      expect(result.accessToken).toBeDefined();
      return { stored: newRow! };
    })();

    expect(next.familyId).toBe('family-1');
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: stored.id, isRevoked: false } }),
    );
  });

  it('revokes the whole family when an old rotated token is reused', async () => {
    const { refreshToken, stored } = await issue('family-1');
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      ...stored,
      isRevoked: true,
      revokedReason: 'ROTATED',
      revokedAt: new Date(Date.now() - 60_000),
    });
    (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

    await expect(service.rotateRefreshToken(refreshToken)).rejects.toThrow(
      'Token reuse detected',
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { familyId: 'family-1', isRevoked: false },
        data: expect.objectContaining({ revokedReason: 'TOKEN_REUSE_DETECTED' }),
      }),
    );
  });

  it('does not revoke the family for a just-rotated token (client race)', async () => {
    const { refreshToken, stored } = await issue('family-1');
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      ...stored,
      isRevoked: true,
      revokedReason: 'ROTATED',
      revokedAt: new Date(),
    });

    await expect(service.rotateRefreshToken(refreshToken)).rejects.toThrow(
      'Refresh token already used',
    );
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('allows only one of two concurrent rotations', async () => {
    const { refreshToken, stored } = await issue('family-1');
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(stored);
    (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    await expect(service.rotateRefreshToken(refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1); // only the initial issue
  });

  it('refuses to refresh a suspended user and revokes the session', async () => {
    const { refreshToken, stored } = await issue('family-1');
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      ...stored,
      user: { ...stored.user, status: 'SUSPENDED' },
    });
    (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await expect(service.rotateRefreshToken(refreshToken)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { familyId: 'family-1', isRevoked: false } }),
    );
  });

  it('refuses to refresh when the organization is suspended', async () => {
    const { refreshToken, stored } = await issue('family-1');
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(stored);
    (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ status: 'SUSPENDED' });

    await expect(service.rotateRefreshToken(refreshToken)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('rejects a refresh token used as an access token', async () => {
    const { refreshToken } = await issue();
    expect(() => service.verifyAccessToken(refreshToken)).toThrow(UnauthorizedError);
  });

  it('rejects tokens signed with a different algorithm', () => {
    const forged = jwt.sign(
      { sub: 'user-1', role: 'PLATFORM_ADMIN', email: 'x@y.z', type: 'access' },
      ACCESS_SECRET,
      { algorithm: 'HS512', issuer: 'omnisupport', audience: 'omnisupport-api' },
    );
    expect(() => service.verifyAccessToken(forged)).toThrow(UnauthorizedError);
  });
});
