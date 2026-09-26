import { z } from 'zod';

const localConfigSchema = z.object({
  path: z.string().default('./uploads'),
  /** Public base URL of the signed download route. */
  baseUrl: z.string().default('http://localhost:3000/api/v1/attachments/files'),
  /** HMAC key for signed download URLs. */
  secret: z.string().min(16, 'LOCAL_STORAGE_SECRET must be at least 16 characters'),
});

const awsConfigSchema = z.object({
  region: z.string().default('us-east-1'),
  accessKeyId: z.string(),
  secretAccessKey: z.string(),
  bucket: z.string(),
  endpoint: z.string().optional(),
});

export const storageConfigSchema = z
  .object({
    provider: z.enum(['memory', 'local', 's3']).default('local'),
    aws: awsConfigSchema.optional(),
    local: localConfigSchema.optional(),
    /** Reject uploads when no antivirus scanner is configured (REQUIRE_AV_SCAN=true). */
    requireAntivirusScan: z.boolean().default(false),
    allowedMimeTypes: z
      .array(z.string())
      .default([
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'text/csv',
      ]),
    maxFileSizeBytes: z.coerce.number().default(10 * 1024 * 1024), // 10MB
  })
  .superRefine((value, ctx) => {
    if (value.provider === 'local' && !value.local) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'LOCAL_STORAGE_SECRET is required when STORAGE_PROVIDER is local',
        path: ['local'],
      });
    }
    if (value.provider === 's3' && !value.aws) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'AWS storage configuration is required when STORAGE_PROVIDER is s3',
        path: ['aws'],
      });
    }
  });

export type AwsStorageConfig = z.infer<typeof awsConfigSchema>;
export type LocalStorageConfig = z.infer<typeof localConfigSchema>;
export type StorageConfig = z.infer<typeof storageConfigSchema>;

export function getStorageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const provider = env.STORAGE_PROVIDER ?? (env.NODE_ENV === 'test' ? 'memory' : 'local');
  const aws =
    provider === 's3'
      ? {
          region: env.AWS_REGION,
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
          bucket: env.AWS_S3_BUCKET,
          endpoint: env.AWS_ENDPOINT,
        }
      : undefined;

  const local =
    provider === 'local'
      ? {
          path: env.LOCAL_STORAGE_PATH,
          baseUrl: env.LOCAL_STORAGE_URL,
          secret: env.LOCAL_STORAGE_SECRET,
        }
      : undefined;

  return storageConfigSchema.parse({
    provider,
    aws,
    local,
    requireAntivirusScan: env.REQUIRE_AV_SCAN === 'true',
    allowedMimeTypes: env.STORAGE_ALLOWED_MIME_TYPES
      ? env.STORAGE_ALLOWED_MIME_TYPES.split(',').map((item) => item.trim())
      : undefined,
    maxFileSizeBytes: env.STORAGE_MAX_FILE_SIZE_BYTES
      ? Number(env.STORAGE_MAX_FILE_SIZE_BYTES)
      : undefined,
  });
}
