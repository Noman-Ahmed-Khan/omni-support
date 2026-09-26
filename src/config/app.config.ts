import { z } from 'zod';

const booleanFlag = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

const appConfigSchema = z.object({
  name: z.string().default('OmniSupport'),
  env: z.enum(['development', 'test', 'production']).default('development'),
  port: z.coerce.number().default(3000),
  frontendUrl: z.string().url().default('http://localhost:3001'),
  corsOrigins: z.string().default('http://localhost:3001'),
  apiPrefix: z.string().default('/api/v1'),
  bcryptRounds: z.coerce.number().default(12),
  maxUploadSizeMb: z.coerce.number().default(10),
  allowPublicRegistration: booleanFlag,
  enableApiDocs: booleanFlag,
  runWorkers: booleanFlag,
  enableTenantPurge: booleanFlag,
  // Express "trust proxy" setting: 'false', 'true', a hop count, or a comma separated list of addresses/CIDRs.
  trustProxy: z.string().default('false'),
  /** Bearer token required by GET /metrics. Without it, /metrics is off in production. */
  metricsToken: z.string().min(16).optional(),
  rateLimitWindowMs: z.coerce.number().int().positive().default(60_000),
  rateLimitMaxRequests: z.coerce.number().int().positive().default(100),
  /** AES-256-GCM key material for EncryptionService (required at startup, see startup.ts). */
  encryptionKey: z
    .string()
    .min(32, 'ENCRYPTION_KEY must be at least 32 characters')
    .optional(),
});

type ParsedAppConfig = z.infer<typeof appConfigSchema>;

export type AppConfig = Omit<
  ParsedAppConfig,
  'allowPublicRegistration' | 'enableApiDocs' | 'runWorkers' | 'enableTenantPurge'
> & {
  allowPublicRegistration: boolean;
  enableApiDocs: boolean;
  runWorkers: boolean;
  enableTenantPurge: boolean;
};

let _appConfig: AppConfig | null = null;

/**
 * Returns the validated application configuration.
 * Config is parsed lazily on first access so that importing this module
 * does NOT trigger environment variable validation at module load time.
 * This keeps unit tests free of infrastructure coupling.
 */
export function getAppConfig(): AppConfig {
  if (!_appConfig) {
    const parsed = appConfigSchema.parse({
      name: process.env.APP_NAME,
      env: process.env.NODE_ENV,
      port: process.env.PORT,
      frontendUrl: process.env.FRONTEND_URL,
      corsOrigins: process.env.CORS_ORIGINS,
      apiPrefix: process.env.API_PREFIX,
      maxUploadSizeMb: process.env.MAX_UPLOAD_SIZE,
      allowPublicRegistration: process.env.ALLOW_PUBLIC_REGISTRATION,
      enableApiDocs: process.env.ENABLE_API_DOCS,
      runWorkers: process.env.RUN_WORKERS,
      enableTenantPurge: process.env.ENABLE_TENANT_PURGE,
      trustProxy: process.env.TRUST_PROXY,
      metricsToken: process.env.METRICS_TOKEN || undefined,
      rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW,
      rateLimitMaxRequests: process.env.RATE_LIMIT_MAX_REQUESTS,
      encryptionKey: process.env.ENCRYPTION_KEY || undefined,
    });

    const isProduction = parsed.env === 'production';

    _appConfig = {
      ...parsed,
      // Secure defaults: self sign-up and public API docs are opt-in in production.
      allowPublicRegistration: parsed.allowPublicRegistration ?? !isProduction,
      enableApiDocs: parsed.enableApiDocs ?? !isProduction,
      runWorkers: parsed.runWorkers ?? true,
      enableTenantPurge: parsed.enableTenantPurge ?? false,
    };
  }
  return _appConfig;
}

/**
 * Converts the TRUST_PROXY string into a value accepted by `app.set('trust proxy', ...)`.
 */
export function resolveTrustProxy(value: string): boolean | number | string[] {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === 'false') return false;
  if (trimmed === 'true') return true;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed.split(',').map((item) => item.trim());
}

/** @internal For testing — resets the singleton so tests can override env vars. */
export function _resetAppConfig(): void {
  _appConfig = null;
}
