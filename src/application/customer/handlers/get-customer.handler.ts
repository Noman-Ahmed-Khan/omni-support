import { CustomerEntity } from '../../../domain/customer/entities/customer.entity';
import { GetCustomerQuery } from '../queries/get-customer.query';
import { CustomerService } from '../services/customer.service';

export class GetCustomerHandler {
  constructor(private readonly customerService: CustomerService) {}

  async execute(query: GetCustomerQuery): Promise<CustomerEntity> {
    return this.customerService.getCustomer(query.customerId, query.tenantId);
  }
}
