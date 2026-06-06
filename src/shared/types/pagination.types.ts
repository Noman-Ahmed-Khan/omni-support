export interface PaginationInput {
  page?: number | string;
  limit?: number | string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationResultMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
