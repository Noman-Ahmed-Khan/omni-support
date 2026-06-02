import { z } from 'zod';

const storageConfigSchema = z.object({
  provider: z.enum(['local', 's3']).default('local'),
  aws: z.object({
    region: z.string().default('us-east-1'),
    accessKeyId: z.string(),
    secretAccessKey: z.string(),
    bucket: z.string(),
    endpoint: z.string().optional(),
  }),
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
});

export const storageConfig = storageConfigSchema.parse({
  provider: process.env.STORAGE_PROVIDER,
  aws: {
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    bucket: process.env.AWS_S3_BUCKET,
    endpoint: process.env.AWS_ENDPOINT,
  },
});
