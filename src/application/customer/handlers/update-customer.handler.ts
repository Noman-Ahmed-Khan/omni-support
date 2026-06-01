import { CustomerEntity } from '../../../domain/customer/entities/customer.entity';
import { UpdateCustomerCommand } from '../commands/update-customer.command';
import { CustomerService } from '../services/customer.service';

export class UpdateCustomerHandler {
  constructor(private readonly customerService: CustomerService) {}

  async execute(command: UpdateCustomerCommand): Promise<CustomerEntity> {
    return this.customerService.updateCustomer(command);
  }
}
