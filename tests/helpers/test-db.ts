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
  // Keep system roles (tenantId: null) but delete tenant-specific data
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
    // Delete tenant-specific role permissions and roles, but keep system roles
    prisma.rolePermission.deleteMany({
      where: {
        role: {
          tenantId: { not: null },
        },
      },
    }),
    prisma.role.deleteMany({
      where: { tenantId: { not: null } },
    }),
    prisma.user.deleteMany(),
    prisma.tenant.deleteMany(),
    // Don't delete system permissions or system roles
  ]);
}


export async function disconnectTestDatabase(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
}