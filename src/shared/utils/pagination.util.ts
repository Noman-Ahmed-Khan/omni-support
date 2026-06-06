import { PaginationInput, PaginationResultMeta } from '../types';

export function normalizePagination(
  input: PaginationInput,
  defaults: { page?: number; limit?: number } = {},
): Required<Pick<PaginationInput, 'page' | 'limit'>> & PaginationInput {
  const page = Number(input.page ?? defaults.page ?? 1);
  const limit = Number(input.limit ?? defaults.limit ?? 20);

  return {
    ...input,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 20,
  };
}

export function toPaginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationResultMeta {
  return {
    total,
    page,
    limit,
    totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
  };
}
