import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

let prismaInstance: PrismaClient | null = null;

export function getTestPrisma(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient({
      datasources: {
        db: { url: process.env.DATABASE_URL },
      },
      log: [],
    });
  }
  return prismaInstance;
}

export async function setupTestDatabase(): Promise<void> {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env },
    stdio: 'pipe',
  });
}

export async function cleanupTestDatabase(): Promise<void> {
  const prisma = getTestPrisma();

  // Delete in correct order respecting FK constraints
  await prisma.$transaction([
    prisma.aIResult.deleteMany(),
    prisma.analyticsSnapshot.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.activityLog.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.attachment.deleteMany(),
    prisma.ticketComment.deleteMany(),
    prisma.ticket.deleteMany(),
    prisma.ticketSequence.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.emailVerifyToken.deleteMany(),
    prisma.oAuthAccount.deleteMany(),
    prisma.tenantIntegration.deleteMany(),
    prisma.webhookEvent.deleteMany(),
    prisma.rolePermission.deleteMany(),
    prisma.user.deleteMany(),
    prisma.tenant.deleteMany(),
    prisma.role.deleteMany(),
    prisma.permission.deleteMany(),
  ]);
}

export async function disconnectTestDatabase(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
}