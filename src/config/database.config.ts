import { z } from 'zod';

const databaseConfigSchema = z.object({
  url: z.string().min(1),
  directUrl: z.string().optional(),
  shadowUrl: z.string().optional(),
  poolTimeoutMs: z.coerce.number().default(30000),
  connectionLimit: z.coerce.number().default(10),
});

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;

let _databaseConfig: DatabaseConfig | null = null;

/**
 * Returns the validated database configuration.
 * Config is parsed lazily on first access so that importing this module
 * does NOT trigger environment variable validation at module load time.
 * This keeps unit tests free of infrastructure coupling.
 */
export function getDatabaseConfig(): DatabaseConfig {
  if (!_databaseConfig) {
    _databaseConfig = databaseConfigSchema.parse({
      url: process.env.DATABASE_URL,
      directUrl: process.env.DIRECT_DATABASE_URL,
      shadowUrl: process.env.SHADOW_DATABASE_URL,
      poolTimeoutMs: process.env.DATABASE_POOL_TIMEOUT_MS,
      connectionLimit: process.env.DATABASE_CONNECTION_LIMIT,
    });
  }
  return _databaseConfig;
}

/** @internal For testing — resets the singleton so tests can override env vars. */
export function _resetDatabaseConfig(): void {
  _databaseConfig = null;
}
