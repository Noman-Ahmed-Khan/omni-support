import { CustomerEntity } from '../customer/entities/customer.entity';

export class HighRiskCustomerSpecification {
  constructor(private readonly threshold = 70) {}

  isSatisfiedBy(customer: CustomerEntity): boolean {
    return customer.riskScore >= this.threshold || customer.isHighRisk();
  }
}
