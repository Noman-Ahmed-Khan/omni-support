import type { TenantEntity } from '../../../domain/tenant/entities/tenant.entity';
import type { PaginatedResult } from '../../../domain/tenant/repositories/tenant.repository.interface';
import type { ListTenantsQuery } from '../queries/list-tenants.query';
import type { TenantService } from '../services/tenant.service';

export class ListTenantsHandler {
  constructor(private readonly tenantService: TenantService) {}

  async execute(query: ListTenantsQuery): Promise<PaginatedResult<TenantEntity>> {
    return this.tenantService.listTenants(query);
  }
}
