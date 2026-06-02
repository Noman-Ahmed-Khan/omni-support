import { z } from 'zod';

const appConfigSchema = z.object({
  name: z.string().default('OmniSupport'),
  env: z.enum(['development', 'test', 'production']).default('development'),
  port: z.coerce.number().default(3000),
  frontendUrl: z.string().url().default('http://localhost:3001'),
  corsOrigins: z.string().default('http://localhost:3001'),
  apiPrefix: z.string().default('/api/v1'),
  bcryptRounds: z.coerce.number().default(12),
  maxUploadSizeMb: z.coerce.number().default(10),
});

export const appConfig = appConfigSchema.parse({
  name: process.env.APP_NAME,
  env: process.env.NODE_ENV,
  port: process.env.PORT,
  frontendUrl: process.env.FRONTEND_URL,
  corsOrigins: process.env.CORS_ORIGINS,
  apiPrefix: process.env.API_PREFIX,
  maxUploadSizeMb: process.env.MAX_UPLOAD_SIZE,
});

export type AppConfig = typeof appConfig;
