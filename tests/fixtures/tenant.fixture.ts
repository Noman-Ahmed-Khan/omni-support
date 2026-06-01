import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

export async function createTestTenant(
  prisma: PrismaClient,
  overrides: Partial<any> = {},
) {
  return prisma.tenant.create({
    data: {
      id: crypto.randomUUID(),
      name: `Test Organization ${Date.now()}`,
      slug: `test-org-${Date.now()}`,
      status: 'ACTIVE',
      plan: 'starter',
      maxAgents: 10,
      maxCustomers: 1000,
      maxTicketsPerDay: 500,
      settings: {},
      ...overrides,
    },
  });
}

export async function createSuspendedTenant(prisma: PrismaClient) {
  return createTestTenant(prisma, {
    status: 'SUSPENDED',
    suspendedAt: new Date(),
    suspendedReason: 'Test suspension',
  });
}