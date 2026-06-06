import express from 'express';
import { createApp } from '../../src/presentation/http/app';
import { buildContainer } from '../../src/container';
import { getTestPrisma } from './test-db';
import { Application } from 'express';

let testApp: Application | null = null;
let testContainer: any = null;

export async function getTestApp(): Promise<{
  app: Application;
  container: any;
}> {
  if (testApp && testContainer) {
    return { app: testApp, container: testContainer };
  }

  const prisma = getTestPrisma();

  // Mock Redis for tests
  const mockRedis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setEx: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    exists: jest.fn().mockResolvedValue(0),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    ping: jest.fn().mockResolvedValue('PONG'),
    sendCommand: jest.fn().mockResolvedValue(null),
  } as any;

  // Mock WebSocket gateway for tests
  const mockWsGateway = {
    sendToUser: jest.fn(),
    sendToTenant: jest.fn(),
    sendToTicket: jest.fn(),
    broadcastToRoom: jest.fn(),
    getConnectedCount: jest.fn().mockReturnValue(0),
    shutdown: jest.fn(),
  } as any;

  testContainer = await buildContainer(prisma, mockRedis, mockWsGateway);
  testApp = createApp(testContainer);

  return { app: testApp, container: testContainer };
}

export async function getAuthToken(
  app: Application,
  role: string = 'TENANT_MANAGER',
  tenantId?: string,
): Promise<{ token: string; userId: string; tenantId: string }> {
  const prisma = getTestPrisma();

  let tenant = null;
  if (tenantId) {
    tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new Error(`Tenant with id ${tenantId} does not exist`);
    }
  } else {
    tenant = await prisma.tenant.create({
      data: {
        id: crypto.randomUUID(),
        name: `Test Org ${Date.now()}`,
        slug: `test-org-${Date.now()}`,
        status: 'ACTIVE',
        plan: 'starter',
        maxAgents: 10,
        maxCustomers: 1000,
        maxTicketsPerDay: 500,
      },
    });
  }

  // Create test user
  const argon2 = await import('argon2');
  const passwordHash = await argon2.hash('TestPass@123');

  const user = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      email: `test-${Date.now()}@test.com`,
      passwordHash,
      firstName: 'Test',
      lastName: 'User',
      role: role as any,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });

  // Generate token directly with issuer and audience to match production
  const jwt = await import('jsonwebtoken');
  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: tenant.id,
      type: 'access',
    },
    process.env.JWT_ACCESS_SECRET!,
    {
      expiresIn: '15m',
      issuer: 'omnisupport',
      audience: 'omnisupport-api',
    },
  );

  return { token, userId: user.id, tenantId: tenant.id };
}