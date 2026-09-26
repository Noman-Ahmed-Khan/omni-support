/** Offset for a 1-based page. */
export function toSkip(page: number, limit: number): number {
  return (Math.max(page, 1) - 1) * limit;
}

export function toTotalPages(total: number, limit: number): number {
  return limit > 0 ? Math.ceil(total / limit) : 0;
}
