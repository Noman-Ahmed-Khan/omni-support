export interface CreateTenantCommand {
  actorId: string;
  actorRole: string;
  name: string;
  slug?: string;
  domain?: string;
  plan?: string;
  maxAgents?: number;
  maxCustomers?: number;
}
