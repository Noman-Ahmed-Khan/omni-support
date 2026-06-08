import { BaseDomainEvent } from '../../shared/base.event';

export class UserRoleChangedEvent extends BaseDomainEvent {
  constructor(
    public readonly userId: string,
    public readonly tenantId: string | undefined,
    public readonly previousRole: string,
    public readonly nextRole: string,
    public readonly changedById?: string,
    public readonly changedByRole?: string,
  ) {
    super('USER_ROLE_CHANGED');
  }
}
