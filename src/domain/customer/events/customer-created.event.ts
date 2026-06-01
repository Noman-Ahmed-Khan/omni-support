import { BaseDomainEvent } from '../../shared/base.event';

export class CustomerCreatedEvent extends BaseDomainEvent {
  constructor(
    public readonly customerId: string,
    public readonly tenantId: string,
    public readonly email: string,
    public readonly fullName: string,
  ) {
    super('CUSTOMER_CREATED');
  }
}
