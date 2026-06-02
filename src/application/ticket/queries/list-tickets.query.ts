export interface ListTicketsQuery {
  filters: {
    tenantId: string;
    status?: string | string[];
    priority?: string | string[];
    category?: string;
    assignedAgentId?: string;
    customerId?: string;
    isEscalated?: boolean;
    search?: string;
    dateFrom?: Date;
    dateTo?: Date;
    tags?: string[];
  };
  pagination: {
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  };
}
