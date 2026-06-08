import type { CustomerEntity } from '../../../domain/customer/entities/customer.entity';
import type { GetCustomerQuery } from '../queries/get-customer.query';
import type { CustomerService } from '../services/customer.service';

export class GetCustomerHandler {
  constructor(private readonly customerService: CustomerService) {}

  async execute(query: GetCustomerQuery): Promise<CustomerEntity> {
    return this.customerService.getCustomer(query.customerId, query.tenantId);
  }
}
