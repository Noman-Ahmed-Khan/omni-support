import { PrismaClient } from '@prisma/client';
import { seedPlatformAdmin } from './platform-admin.seed';
import { seedRoles } from './roles.seed';
import { seedPermissions } from './permissions.seed';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  await seedPermissions(prisma);
  console.log('-> Permissions seeded');

  await seedRoles(prisma);
  console.log('-> Roles seeded');

  await seedPlatformAdmin(prisma);
  console.log('-> Platform admin seeded');

  console.log('-> Seed completed successfully');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });