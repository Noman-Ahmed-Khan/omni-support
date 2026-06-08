import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().email().trim().toLowerCase();

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
    message: 'Slug must be lowercase alphanumeric with hyphens',
  });

export const trimmedStringSchema = (min: number = 1, max?: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max ?? Number.MAX_SAFE_INTEGER);

export const optionalTrimmedStringSchema = (max?: number) =>
  z
    .string()
    .trim()
    .max(max ?? Number.MAX_SAFE_INTEGER)
    .optional();

export const paginationPageSchema = z.coerce.number().int().min(1).default(1);
export const paginationLimitSchema = z.coerce.number().int().min(1).max(100).default(20);
export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');
