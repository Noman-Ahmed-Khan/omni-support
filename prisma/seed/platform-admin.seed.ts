import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

export async function seedPlatformAdmin(prisma: PrismaClient) {
  const email = process.env.PLATFORM_ADMIN_EMAIL || 'admin@omnisupport.io';
  const password = process.env.PLATFORM_ADMIN_PASSWORD || 'Admin@123456!';

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      firstName: 'Platform',
      lastName: 'Admin',
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
}