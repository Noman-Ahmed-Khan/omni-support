import { CustomerTimelineQuery } from '../queries/customer-timeline.query';
import { CustomerService } from '../services/customer.service';

export class CustomerTimelineHandler {
  constructor(private readonly customerService: CustomerService) {}

  async execute(query: CustomerTimelineQuery): Promise<unknown> {
    return this.customerService.getCustomerTimeline(
      query.customerId,
      query.tenantId,
      query.page,
      query.limit,
    );
  }
}
