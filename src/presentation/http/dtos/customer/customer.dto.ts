import { z } from 'zod';

export const createCustomerSchema = z.object({
  fullName: z
    .string()
    .min(2, 'Full name must be at least 2 characters')
    .max(200)
    .trim(),
  email: z.string().email('Invalid email address').toLowerCase(),
  phone: z
    .string()
    .regex(/^\+?[\d\s\-().]{7,20}$/, 'Invalid phone number')
    .optional(),
  company: z.string().max(200).trim().optional(),
  notes: z.string().max(5000).trim().optional(),
  assignedAgentId: z.string().uuid().optional(),
  externalId: z.string().max(200).optional(),
});

export const updateCustomerSchema = z.object({
  fullName: z.string().min(2).max(200).trim().optional(),
  phone: z
    .string()
    .regex(/^\+?[\d\s\-().]{7,20}$/)
    .optional(),
  company: z.string().max(200).trim().optional(),
  notes: z.string().max(5000).trim().optional(),
  assignedAgentId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']).optional(),
});

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'fullName', 'riskScore', 'lastActivityAt'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']).optional(),
  assignedAgentId: z.string().uuid().optional(),
  riskLabel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  search: z.string().max(200).optional(),
});

export type CreateCustomerDto = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerDto = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQueryDto = z.infer<typeof listCustomersQuerySchema>;