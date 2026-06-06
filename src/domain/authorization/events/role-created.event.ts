import { BaseDomainEvent } from '../../shared/base.event';

export class RoleCreatedEvent extends BaseDomainEvent {
  constructor(
    public readonly roleId: string,
    public readonly tenantId: string | null | undefined,
    public readonly roleName: string,
  ) {
    super('ROLE_CREATED');
  }
}
