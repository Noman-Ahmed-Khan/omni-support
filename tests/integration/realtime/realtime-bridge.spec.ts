import type { RedisClientType } from 'redis';

import { createRedisClient } from '../../../src/infrastructure/cache/redis.client';
import {
  bridgeRealtimeToGateway,
  RedisRealtimePublisher,
  type RealtimePublisher,
} from '../../../src/infrastructure/realtime/realtime-publisher';

describe('Realtime bridge over Redis (Integration)', () => {
  let redis: RedisClientType;

  beforeAll(async () => {
    redis = await createRedisClient();
  });

  it('delivers events published by any process to the local gateway', async () => {
    const received: Array<[string, string, string]> = [];
    const gateway: RealtimePublisher = {
      sendToUser: (id, message) => received.push(['user', id, message.event]),
      sendToTenant: (id, message) => received.push(['tenant', id, message.event]),
      sendToTicket: (id, message) => received.push(['ticket', id, message.event]),
    };

    const stop = await bridgeRealtimeToGateway(redis, gateway);
    const publisher = new RedisRealtimePublisher(redis);

    publisher.sendToTicket('ticket-1', { event: 'ai:sentiment', data: {} });
    publisher.sendToUser('user-1', { event: 'notification', data: {} });
    publisher.sendToTenant('tenant-1', { event: 'ticket:created', data: {} });

    for (let i = 0; i < 50 && received.length < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await stop();

    expect(received).toEqual([
      ['ticket', 'ticket-1', 'ai:sentiment'],
      ['user', 'user-1', 'notification'],
      ['tenant', 'tenant-1', 'ticket:created'],
    ]);
  });
});
