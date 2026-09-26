import { PrismaClient } from '@prisma/client';

import { seedPlatformAdmin } from './platform-admin.seed';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  await seedPlatformAdmin(prisma);
  console.log('-> Platform admin seeded');

  console.log('-> Seed completed successfully');
}

main()
  .catch((e: unknown) => {
    console.error('Seed failed:', e);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
