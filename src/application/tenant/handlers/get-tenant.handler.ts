import { TenantEntity } from '../../../domain/tenant/entities/tenant.entity';
import { ITenantRepository } from '../../../domain/tenant/repositories/tenant.repository.interface';
import { NotFoundError } from '../../../shared/errors/domain.error';
import { GetTenantQuery } from '../queries/get-tenant.query';

export class GetTenantHandler {
  constructor(private readonly tenantRepo: ITenantRepository) {}

  async execute(query: GetTenantQuery): Promise<TenantEntity> {
    const tenant = await this.tenantRepo.findById(query.tenantId);
    if (!tenant) throw new NotFoundError('Tenant', query.tenantId);
    return tenant;
  }
}
