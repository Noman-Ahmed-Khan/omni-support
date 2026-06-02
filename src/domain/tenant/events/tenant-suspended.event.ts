import { BaseDomainEvent } from '../../shared/base.event';

export class TenantSuspendedEvent extends BaseDomainEvent {
  constructor(
    public readonly tenantId: string,
    public readonly reason: string,
  ) {
    super('TENANT_SUSPENDED');
  }
}
