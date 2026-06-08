import type { CustomerEntity } from '../../../domain/customer/entities/customer.entity';
import type { CreateCustomerCommand } from '../commands/create-customer.command';
import type { CustomerService } from '../services/customer.service';

export class CreateCustomerHandler {
  constructor(private readonly customerService: CustomerService) {}

  async execute(command: CreateCustomerCommand): Promise<CustomerEntity> {
    return this.customerService.createCustomer(command);
  }
}
