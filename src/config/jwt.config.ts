import { z } from 'zod';

const jwtConfigSchema = z.object({
  accessSecret: z.string().min(32),
  refreshSecret: z.string().min(32),
  accessExpiresIn: z.string().default('15m'),
  refreshExpiresIn: z.string().default('30d'),
  refreshExpiresInMs: z.coerce.number().default(30 * 24 * 60 * 60 * 1000),
});

export type JwtConfig = z.infer<typeof jwtConfigSchema>;

let _jwtConfig: JwtConfig | null = null;

/**
 * Returns the validated JWT configuration.
 * Config is parsed lazily on first access so that importing this module
 * does NOT trigger environment variable validation at module load time.
 * This keeps unit tests free of infrastructure coupling.
 */
export function getJwtConfig(): JwtConfig {
  if (!_jwtConfig) {
    _jwtConfig = jwtConfigSchema.parse({
      accessSecret: process.env.JWT_ACCESS_SECRET,
      refreshSecret: process.env.JWT_REFRESH_SECRET,
      accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN,
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
      refreshExpiresInMs: 30 * 24 * 60 * 60 * 1000,
    });
  }
  return _jwtConfig;
}

/** @internal For testing — resets the singleton so tests can override env vars. */
export function _resetJwtConfig(): void {
  _jwtConfig = null;
}
