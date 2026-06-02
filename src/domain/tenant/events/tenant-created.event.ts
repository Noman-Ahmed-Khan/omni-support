import { BaseDomainEvent } from '../../shared/base.event';

export class TenantCreatedEvent extends BaseDomainEvent {
  constructor(
    public readonly tenantId: string,
    public readonly name: string,
    public readonly slug: string,
  ) {
    super('TENANT_CREATED');
  }
}
