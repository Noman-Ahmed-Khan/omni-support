import {
  ITenantRepository,
  PaginatedResult,
} from '../../../domain/tenant/repositories/tenant.repository.interface';
import { TenantEntity } from '../../../domain/tenant/entities/tenant.entity';
import { ListTenantsQuery } from '../queries/list-tenants.query';

export class ListTenantsHandler {
  constructor(private readonly tenantRepo: ITenantRepository) {}

  async execute(query: ListTenantsQuery): Promise<PaginatedResult<TenantEntity>> {
    return this.tenantRepo.findAll(query.filters, query.page, query.limit);
  }
}
