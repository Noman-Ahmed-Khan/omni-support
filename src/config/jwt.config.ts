import { z } from 'zod';

const DURATION_PATTERN = /^(\d+)\s*(ms|s|m|h|d)?$/;

const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/**
 * Parses a jsonwebtoken-style duration ("15m", "30d", "3600") into milliseconds.
 * Bare numbers are treated as seconds, matching jsonwebtoken's `expiresIn` semantics.
 */
export function parseDurationMs(value: string): number {
  const match = DURATION_PATTERN.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration: ${value}`);
  }
  const amount = Number(match[1]);
  const unit = match[2] ?? 's';
  return amount * UNIT_MS[unit];
}

const durationSchema = z.string().refine((value) => DURATION_PATTERN.test(value.trim()), {
  message: 'Must be a duration such as 15m, 12h, 30d or a number of seconds',
});

const jwtConfigSchema = z.object({
  accessSecret: z.string().min(32),
  refreshSecret: z.string().min(32),
  accessExpiresIn: durationSchema.default('15m'),
  refreshExpiresIn: durationSchema.default('30d'),
});

export type JwtConfig = z.infer<typeof jwtConfigSchema> & {
  accessExpiresInSeconds: number;
  refreshExpiresInMs: number;
};

export const JWT_ALGORITHM = 'HS256';
export const JWT_ISSUER = 'omnisupport';
export const JWT_AUDIENCE = 'omnisupport-api';

let _jwtConfig: JwtConfig | null = null;

/**
 * Returns the validated JWT configuration.
 * Config is parsed lazily on first access so that importing this module
 * does NOT trigger environment variable validation at module load time.
 * This keeps unit tests free of infrastructure coupling.
 */
export function getJwtConfig(): JwtConfig {
  if (!_jwtConfig) {
    const parsed = jwtConfigSchema.parse({
      accessSecret: process.env.JWT_ACCESS_SECRET,
      refreshSecret: process.env.JWT_REFRESH_SECRET,
      accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN,
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
    });

    _jwtConfig = {
      ...parsed,
      accessExpiresInSeconds: Math.floor(parseDurationMs(parsed.accessExpiresIn) / 1000),
      refreshExpiresInMs: parseDurationMs(parsed.refreshExpiresIn),
    };
  }
  return _jwtConfig;
}

/** @internal For testing — resets the singleton so tests can override env vars. */
export function _resetJwtConfig(): void {
  _jwtConfig = null;
}
