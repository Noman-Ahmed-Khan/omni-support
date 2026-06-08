import type { CustomerEntity } from '../../../domain/customer/entities/customer.entity';
import type { PaginatedResult } from '../../../domain/customer/repositories/customer.repository.interface';
import type { ListCustomersQuery } from '../queries/list-customers.query';
import type { CustomerService } from '../services/customer.service';

export class ListCustomersHandler {
  constructor(private readonly customerService: CustomerService) {}

  async execute(query: ListCustomersQuery): Promise<PaginatedResult<CustomerEntity>> {
    return this.customerService.listCustomers(query.filters, query.pagination);
  }
}
