import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';
import { buildContainer } from '../src/infrastructure/di';
import { WebSocketGateway } from '../src/infrastructure/realtime/websocket.gateway';
import { logger } from '../src/shared/utils/logger.util';
import { TenantService } from '../src/application/tenant/services/tenant.service';
import crypto from 'crypto';

async function main() {
  const args = process.argv.slice(2);
  const name = args[0];
  const domain = args[1];
  const plan = args[2] || 'enterprise';

  if (!name) {
    console.error('Usage: tsx create-tenant.ts <name> [domain] [plan]');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
  await redis.connect();
  const wsGateway = new WebSocketGateway(redis);

  logger.info('Initializing application container for CLI...');
  const container = await buildContainer(prisma, redis, wsGateway);

  const tenantService = container.resolve<TenantService>('tenantService');

  try {
    logger.info(`Creating tenant: ${name}`);
    const tenant = await tenantService.createTenant({
      name,
      domain,
      plan,
      actorId: 'system-cli',
      actorRole: 'SYSTEM',
    });

    logger.info(`Successfully created tenant! ID: ${tenant.id}, Slug: ${tenant.slug}`);
    console.log(JSON.stringify(tenant, null, 2));
  } catch (err) {
    logger.error('Failed to create tenant', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await redis.quit();
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
