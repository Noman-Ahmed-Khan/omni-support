/**
 * Read-only report for the account-related security fixes (SEC-01, SEC-02):
 * - platform admins that belong to an organization (possible self-promotion),
 * - non-admin staff without an organization (created by the old public sign-up),
 * - recent role changes.
 *
 * Nothing is modified; decide per account what to do.
 *
 * Usage: tsx scripts/audit-accounts.ts [daysOfRoleHistory=90]
 */
import 'dotenv/config';

import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const days = Number(process.argv[2] ?? 90);
  const prisma = new PrismaClient();

  try {
    const adminsWithTenant = await prisma.user.findMany({
      where: { role: 'PLATFORM_ADMIN', tenantId: { not: null } },
      select: { id: true, email: true, tenantId: true, updatedAt: true },
    });

    const tenantlessStaff = await prisma.user.findMany({
      where: { tenantId: null, role: { in: ['TENANT_MANAGER', 'AGENT'] } },
      select: { id: true, email: true, role: true, createdAt: true, status: true },
    });

    const roleChanges = await prisma.auditLog.findMany({
      where: {
        resource: 'users',
        action: 'ROLE_CHANGE',
        occurredAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
      },
      select: { actorId: true, resourceId: true, newValue: true, occurredAt: true },
      orderBy: { occurredAt: 'desc' },
    });

    console.log(
      JSON.stringify(
        {
          platformAdminsWithOrganization: adminsWithTenant,
          staffWithoutOrganization: tenantlessStaff,
          roleChangesLastDays: { days, entries: roleChanges },
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
