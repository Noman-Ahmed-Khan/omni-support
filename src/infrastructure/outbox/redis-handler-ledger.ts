import type { RedisClientType } from 'redis';

import type { HandlerLedger } from '../../application/event-bus/event-bus';

const KEY_PREFIX = 'event-handler:done:';
/** Longer than the outbox retry window (max attempts with exponential backoff). */
const TTL_SECONDS = 7 * 24 * 60 * 60;

export class RedisHandlerLedger implements HandlerLedger {
  constructor(private readonly redis: Pick<RedisClientType, 'exists' | 'set'>) {}

  async isDone(key: string): Promise<boolean> {
    return (await this.redis.exists(KEY_PREFIX + key)) === 1;
  }

  async markDone(key: string): Promise<void> {
    await this.redis.set(KEY_PREFIX + key, '1', { EX: TTL_SECONDS });
  }
}
