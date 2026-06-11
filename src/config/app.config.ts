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

export type AppConfig = z.infer<typeof appConfigSchema>;

let _appConfig: AppConfig | null = null;

/**
 * Returns the validated application configuration.
 * Config is parsed lazily on first access so that importing this module
 * does NOT trigger environment variable validation at module load time.
 * This keeps unit tests free of infrastructure coupling.
 */
export function getAppConfig(): AppConfig {
  if (!_appConfig) {
    _appConfig = appConfigSchema.parse({
      name: process.env.APP_NAME,
      env: process.env.NODE_ENV,
      port: process.env.PORT,
      frontendUrl: process.env.FRONTEND_URL,
      corsOrigins: process.env.CORS_ORIGINS,
      apiPrefix: process.env.API_PREFIX,
      maxUploadSizeMb: process.env.MAX_UPLOAD_SIZE,
    });
  }
  return _appConfig;
}

/** @internal For testing — resets the singleton so tests can override env vars. */
export function _resetAppConfig(): void {
  _appConfig = null;
}
