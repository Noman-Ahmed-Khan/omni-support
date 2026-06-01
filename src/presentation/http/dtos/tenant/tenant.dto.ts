import { z } from 'zod';

export const createTenantSchema = z.object({
  name: z
    .string()
    .min(2, 'Organization name must be at least 2 characters')
    .max(200)
    .trim(),
  slug: z
    .string()
    .min(3)
    .max(63)
    .regex(
      /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
      'Slug must be lowercase alphanumeric with hyphens',
    )
    .optional(),
  domain: z.string().max(253).optional(),
  plan: z.enum(['starter', 'professional', 'enterprise']).default('starter'),
  maxAgents: z.number().int().min(1).max(1000).default(5),
  maxCustomers: z.number().int().min(1).max(100000).default(1000),
});

export const updateTenantSchema = z.object({
  name: z.string().min(2).max(200).trim().optional(),
  domain: z.string().max(253).optional(),
  plan: z.enum(['starter', 'professional', 'enterprise']).optional(),
  maxAgents: z.number().int().min(1).max(1000).optional(),
  maxCustomers: z.number().int().min(1).max(100000).optional(),
  settings: z.record(z.unknown()).optional(),
});

export const suspendTenantSchema = z.object({
  reason: z
    .string()
    .min(10, 'Suspension reason must be at least 10 characters')
    .max(1000),
});

export type CreateTenantDto = z.infer<typeof createTenantSchema>;
export type UpdateTenantDto = z.infer<typeof updateTenantSchema>;
export type SuspendTenantDto = z.infer<typeof suspendTenantSchema>;