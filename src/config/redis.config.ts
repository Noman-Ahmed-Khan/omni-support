import { z } from 'zod';

const redisConfigSchema = z.object({
  url: z.string().url().optional(),
  host: z.string().default('localhost'),
  port: z.coerce.number().default(6379),
  password: z.string().optional(),
  db: z.coerce.number().default(0),
});

export type RedisConfig = z.infer<typeof redisConfigSchema>;

let _redisConfig: RedisConfig | null = null;

/**
 * Returns the validated Redis configuration.
 * Config is parsed lazily on first access so that importing this module
 * does NOT trigger environment variable validation at module load time.
 * This keeps unit tests free of infrastructure coupling.
 */
export function getRedisConfig(): RedisConfig {
  if (!_redisConfig) {
    _redisConfig = redisConfigSchema.parse({
      url: process.env.REDIS_URL,
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD,
      db: process.env.REDIS_DB,
    });
  }
  return _redisConfig;
}

/** @internal For testing — resets the singleton so tests can override env vars. */
export function _resetRedisConfig(): void {
  _redisConfig = null;
}
