export interface SuspendTenantCommand {
  tenantId: string;
  actorId: string;
  actorRole: string;
  reason: string;
}
