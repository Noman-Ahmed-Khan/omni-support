import type { TenantEntity } from '../../../domain/tenant/entities/tenant.entity';
import type { GetTenantQuery } from '../queries/get-tenant.query';
import type { TenantService } from '../services/tenant.service';

export class GetTenantHandler {
  constructor(private readonly tenantService: TenantService) {}

  async execute(query: GetTenantQuery): Promise<TenantEntity> {
    return this.tenantService.getTenant(query);
  }
}
