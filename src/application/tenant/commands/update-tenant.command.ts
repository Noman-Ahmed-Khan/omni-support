export interface UpdateTenantCommand {
  tenantId: string;
  actorId: string;
  actorRole: string;
  settings?: Record<string, unknown>;
}
