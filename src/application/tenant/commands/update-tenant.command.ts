export interface UpdateTenantCommand {
  tenantId: string;
  actorId: string;
  actorRole: string;
  name?: string;
  domain?: string;
  plan?: string;
  maxAgents?: number;
  maxCustomers?: number;
  maxTicketsPerDay?: number;
  settings?: Record<string, unknown>;
}
