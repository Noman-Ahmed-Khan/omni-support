import { PrismaClient, UserRole } from '@prisma/client';
import { TokenService } from '../../src/application/auth/services/token.service';
import { PasswordHasher } from '../../src/infrastructure/security/password-hasher';
import crypto from 'crypto';

export interface TestUserOptions {
  email?: string;
  password?: string;
  role?: UserRole;
  tenantId?: string;
  firstName?: string;
  lastName?: string;
  isVerified?: boolean;
}

export async function createTestUser(
  prisma: PrismaClient,
  options: TestUserOptions = {},
) {
  const hasher = new PasswordHasher();
  const password = options.password || 'TestPassword123!';
  const passwordHash = await hasher.hash(password);

  const userId = crypto.randomUUID();

  const user = await prisma.user.create({
    data: {
      id: userId,
      email: options.email || `test-${userId}@example.com`,
      passwordHash,
      firstName: options.firstName || 'Test',
      lastName: options.lastName || 'User',
      role: options.role || 'AGENT',
      tenantId: options.tenantId,
      status: options.isVerified === false ? 'PENDING_VERIFICATION' : 'ACTIVE',
      emailVerifiedAt: options.isVerified === false ? null : new Date(),
    },
  });

  return { user, password };
}

export async function getAuthToken(
  user: { id: string; email: string; role: string; tenantId?: string | null },
  tokenService: TokenService,
) {
  const tokenPair = await tokenService.createTokenPair(
    user.id,
    {
      email: user.email,
      role: user.role,
      tenantId: user.tenantId ?? undefined,
    },
    '127.0.0.1',
    'Test User Agent',
  );

  return tokenPair;
}

export async function createAuthenticatedUser(
  prisma: PrismaClient,
  tokenService: TokenService,
  options: TestUserOptions = {},
) {
  const { user, password } = await createTestUser(prisma, options);
  const tokens = await getAuthToken(user, tokenService);

  return {
    user,
    password,
    tokens,
  };
}
