import { z } from 'zod';

export const createTicketSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID'),
  title: z.string().min(5, 'Title must be at least 5 characters').max(500).trim(),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(50000)
    .trim(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional().default('MEDIUM'),
  category: z
    .enum(['BILLING', 'TECHNICAL', 'ACCOUNT', 'REFUND', 'SHIPPING', 'GENERAL', 'OTHER'])
    .optional()
    .default('GENERAL'),
  tags: z.array(z.string().max(50)).max(10).optional().default([]),
  source: z.enum(['web', 'email', 'whatsapp', 'api']).optional().default('web'),
  assignedAgentId: z.string().uuid().optional(),
  dueAt: z.string().datetime().optional(),
});

export const updateTicketSchema = z.object({
  title: z.string().min(5).max(500).trim().optional(),
  description: z.string().min(10).max(50000).trim().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  category: z
    .enum(['BILLING', 'TECHNICAL', 'ACCOUNT', 'REFUND', 'SHIPPING', 'GENERAL', 'OTHER'])
    .optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  dueAt: z.string().datetime().optional(),
});

export const assignTicketSchema = z.object({
  agentId: z.string().uuid('Invalid agent ID'),
});

export const changeStatusSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED']),
});

export const escalateTicketSchema = z.object({
  reason: z
    .string()
    .min(10, 'Escalation reason must be at least 10 characters')
    .max(1000)
    .trim(),
});

export const addCommentSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty').max(50000).trim(),
  type: z.enum(['PUBLIC', 'INTERNAL']).default('PUBLIC'),
});

export const listTicketsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'priority', 'status', 'ticketNumber'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  status: z
    .string()
    .optional()
    .transform((v) => v?.split(',')),
  priority: z
    .string()
    .optional()
    .transform((v) => v?.split(',')),
  category: z.string().optional(),
  assignedAgentId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  isEscalated: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  search: z.string().max(200).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  tags: z
    .string()
    .optional()
    .transform((v) => v?.split(',')),
});

export type CreateTicketDto = z.infer<typeof createTicketSchema>;
export type UpdateTicketDto = z.infer<typeof updateTicketSchema>;
export type AssignTicketDto = z.infer<typeof assignTicketSchema>;
export type ChangeStatusDto = z.infer<typeof changeStatusSchema>;
export type EscalateTicketDto = z.infer<typeof escalateTicketSchema>;
export type AddCommentDto = z.infer<typeof addCommentSchema>;
export type ListTicketsQueryDto = z.infer<typeof listTicketsQuerySchema>;
