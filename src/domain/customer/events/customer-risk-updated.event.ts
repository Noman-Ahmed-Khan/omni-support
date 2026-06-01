import { BaseDomainEvent } from '../../shared/base.event';

export class CustomerRiskUpdatedEvent extends BaseDomainEvent {
  constructor(
    public readonly customerId: string,
    public readonly tenantId: string,
    public readonly previousScore: number,
    public readonly newScore: number,
    public readonly riskLabel: string,
  ) {
    super('CUSTOMER_RISK_UPDATED');
  }
}
