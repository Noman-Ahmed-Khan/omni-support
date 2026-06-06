import { BaseDomainEvent } from '../../shared/base.event';

export class RolePermissionAssignedEvent extends BaseDomainEvent {
  constructor(
    public readonly roleId: string,
    public readonly permissionId: string,
    public readonly tenantId: string | null | undefined,
  ) {
    super('ROLE_PERMISSION_ASSIGNED');
  }
}
