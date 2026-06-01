import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import crypto from 'crypto';

export const TEST_PASSWORD = 'TestPass@123!';

export async function createTestUser(
  prisma: PrismaClient,
  tenantId: string,
  overrides: Partial<any> = {},
) {
  const passwordHash = await argon2.hash(TEST_PASSWORD);

  return prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      tenantId,
      email: `user-${Date.now()}@test.com`,
      passwordHash,
      firstName: 'Test',
      lastName: 'User',
      role: 'AGENT',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      failedLoginAttempts: 0,
      timezone: 'UTC',
      locale: 'en',
      ...overrides,
    },
  });
}

export async function createTestManager(prisma: PrismaClient, tenantId: string) {
  return createTestUser(prisma, tenantId, { role: 'TENANT_MANAGER' });
}

export async function createTestAgent(prisma: PrismaClient, tenantId: string) {
  return createTestUser(prisma, tenantId, { role: 'AGENT' });
}