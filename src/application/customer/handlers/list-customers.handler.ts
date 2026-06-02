import { ListCustomersQuery } from '../queries/list-customers.query';
import { CustomerService } from '../services/customer.service';
import { PaginatedResult } from '../../../domain/customer/repositories/customer.repository.interface';
import { CustomerEntity } from '../../../domain/customer/entities/customer.entity';

export class ListCustomersHandler {
  constructor(private readonly customerService: CustomerService) {}

  async execute(query: ListCustomersQuery): Promise<PaginatedResult<CustomerEntity>> {
    return this.customerService.listCustomers(query.filters, query.pagination);
  }
}
