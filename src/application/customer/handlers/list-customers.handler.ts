import { ListCustomersQuery } from '../queries/list-customers.query';
import { CustomerService } from '../services/customer.service';

export class ListCustomersHandler {
  constructor(private readonly customerService: CustomerService) {}

  async execute(query: ListCustomersQuery): Promise<unknown> {
    return this.customerService.listCustomers(query.filters, query.pagination);
  }
}
