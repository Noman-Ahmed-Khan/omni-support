export interface ListTenantsQuery {
  filters: {
    status?: string;
    plan?: string;
    search?: string;
  };
  page: number;
  limit: number;
}
