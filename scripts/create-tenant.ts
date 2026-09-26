import 'dotenv/config';
import http from 'http';

import type { TenantService } from '../src/application/tenant/services/tenant.service';
import { buildContainer } from '../src/bootstrap/container';
import {
  createRedisClient,
  disconnectRedis,
} from '../src/infrastructure/cache/redis.client';
import {
  connectDatabase,
  disconnectDatabase,
  prisma,
} from '../src/infrastructure/database/prisma.client';
import { closeAllQueues } from '../src/infrastructure/queue/queue.factory';
import { WebSocketAuth } from '../src/infrastructure/realtime/websocket.auth';
import { WebSocketGateway } from '../src/infrastructure/realtime/websocket.gateway';
import { logger } from '../src/shared/utils/logger.util';
import { SYSTEM_ACTOR_ID } from '../src/shared/utils/system-actor.util';

async function main(): Promise<void> {
  const [name, domain, plan = 'enterprise'] = process.argv.slice(2);

  if (!name) {
    console.error('Usage: tsx scripts/create-tenant.ts <name> [domain] [plan]');
    process.exit(1);
  }

  await connectDatabase();
  const redis = await createRedisClient();
  // The CLI has no WebSocket clients; the gateway is attached to an unused server.
  const wsGateway = new WebSocketGateway(http.createServer(), new WebSocketAuth());

  logger.info('Initializing application container for CLI...');
  const container = await buildContainer(prisma, redis, wsGateway);
  const tenantService = container.resolve<TenantService>('tenantService');

  let exitCode = 0;
  try {
    logger.info(`Creating tenant: ${name}`);
    const tenant = await tenantService.createTenant({
      name,
      domain,
      plan,
      actorId: SYSTEM_ACTOR_ID,
      actorRole: 'SYSTEM',
    });

    logger.info(`Created tenant ${tenant.id} (${tenant.slug})`);
    console.log(JSON.stringify({ id: tenant.id, name: tenant.name }, null, 2));
  } catch (err) {
    logger.error('Failed to create tenant', { error: err });
    exitCode = 1;
  } finally {
    await wsGateway.shutdown();
    await closeAllQueues();
    await disconnectDatabase();
    await disconnectRedis();
  }

  process.exit(exitCode);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
