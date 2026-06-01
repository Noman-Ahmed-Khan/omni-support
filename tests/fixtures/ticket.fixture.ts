import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

export async function createTestCustomer(
  prisma: PrismaClient,
  tenantId: string,
  overrides: Partial<any> = {},
) {
  return prisma.customer.create({
    data: {
      id: crypto.randomUUID(),
      tenantId,
      fullName: 'John Customer',
      email: `customer-${Date.now()}@test.com`,
      status: 'ACTIVE',
      riskScore: 0,
      metadata: {},
      ...overrides,
    },
  });
}

export async function createTestTicket(
  prisma: PrismaClient,
  tenantId: string,
  customerId: string,
  createdById: string,
  overrides: Partial<any> = {},
) {
  // Get next ticket number
  const sequence = await prisma.ticketSequence.upsert({
    where: { tenantId },
    update: { lastNumber: { increment: 1 } },
    create: { tenantId, lastNumber: 1 },
  });

  return prisma.ticket.create({
    data: {
      id: crypto.randomUUID(),
      tenantId,
      ticketNumber: sequence.lastNumber,
      customerId,
      createdById,
      title: 'Test Ticket',
      description: 'This is a test ticket description for testing purposes',
      status: 'OPEN',
      priority: 'MEDIUM',
      category: 'GENERAL',
      tags: [],
      source: 'web',
      isEscalated: false,
      slaBreached: false,
      metadata: {},
      ...overrides,
    },
  });
}