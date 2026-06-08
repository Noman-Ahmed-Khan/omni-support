import type { DeleteCustomerCommand } from '../commands/delete-customer.command';
import type { CustomerService } from '../services/customer.service';

export class DeleteCustomerHandler {
  constructor(private readonly customerService: CustomerService) {}

  async execute(command: DeleteCustomerCommand): Promise<void> {
    await this.customerService.deleteCustomer(
      command.customerId,
      command.tenantId,
      command.deletedById,
      command.deletedByRole,
    );
  }
}
