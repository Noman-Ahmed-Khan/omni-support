import { z } from 'zod';

import {
  paginationLimitSchema,
  paginationPageSchema,
  sortOrderSchema,
} from './common.schemas';

export const paginationSchema = z.object({
  page: paginationPageSchema,
  limit: paginationLimitSchema,
  sortBy: z.string().optional(),
  sortOrder: sortOrderSchema,
});

export type PaginationDto = z.infer<typeof paginationSchema>;
