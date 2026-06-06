import { z } from 'zod';

const databaseConfigSchema = z.object({
  url: z.string().min(1),
  directUrl: z.string().optional(),
  shadowUrl: z.string().optional(),
  poolTimeoutMs: z.coerce.number().default(30000),
  connectionLimit: z.coerce.number().default(10),
});

export const databaseConfig = databaseConfigSchema.parse({
  url: process.env.DATABASE_URL,
  directUrl: process.env.DIRECT_DATABASE_URL,
  shadowUrl: process.env.SHADOW_DATABASE_URL,
  poolTimeoutMs: process.env.DATABASE_POOL_TIMEOUT_MS,
  connectionLimit: process.env.DATABASE_CONNECTION_LIMIT,
});
