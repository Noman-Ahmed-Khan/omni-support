export interface CustomerTimelineQuery {
  customerId: string;
  tenantId: string;
  page?: number;
  limit?: number;
}
