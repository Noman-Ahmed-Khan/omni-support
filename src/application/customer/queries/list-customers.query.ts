export interface ListCustomersQuery {
  filters: {
    tenantId: string;
    status?: string;
    assignedAgentId?: string;
    riskLabel?: string;
    search?: string;
  };
  pagination: {
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  };
}
