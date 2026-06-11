import { z } from 'zod';

const redisConfigSchema = z.object({
  url: z.string().url().optional(),
  host: z.string().default('localhost'),
  port: z.coerce.number().default(6379),
  password: z.string().optional(),
  db: z.coerce.number().default(0),
});

export const redisConfig = redisConfigSchema.parse({
  url: process.env.REDIS_URL,
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  db: process.env.REDIS_DB,
});
