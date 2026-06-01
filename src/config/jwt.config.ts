import { z } from 'zod';

const jwtConfigSchema = z.object({
  accessSecret: z.string().min(32),
  refreshSecret: z.string().min(32),
  accessExpiresIn: z.string().default('15m'),
  refreshExpiresIn: z.string().default('30d'),
  refreshExpiresInMs: z.coerce.number().default(30 * 24 * 60 * 60 * 1000),
});

export const jwtConfig = jwtConfigSchema.parse({
  accessSecret: process.env.JWT_ACCESS_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN,
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
  refreshExpiresInMs: 30 * 24 * 60 * 60 * 1000,
});

export type JwtConfig = typeof jwtConfig;