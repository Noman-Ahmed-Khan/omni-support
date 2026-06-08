import type { CustomerEntity } from '../../../domain/customer/entities/customer.entity';
import type { UpdateCustomerCommand } from '../commands/update-customer.command';
import type { CustomerService } from '../services/customer.service';

export class UpdateCustomerHandler {
  constructor(private readonly customerService: CustomerService) {}

  async execute(command: UpdateCustomerCommand): Promise<CustomerEntity> {
    return this.customerService.updateCustomer(command);
  }
}
