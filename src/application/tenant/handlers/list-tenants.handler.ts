import { ITenantRepository } from '../../../domain/tenant/repositories/tenant.repository.interface';
import { ListTenantsQuery } from '../queries/list-tenants.query';

export class ListTenantsHandler {
  constructor(private readonly tenantRepo: ITenantRepository) {}

  async execute(query: ListTenantsQuery): Promise<unknown> {
    return this.tenantRepo.findAll(query.filters, query.page, query.limit);
  }
}
