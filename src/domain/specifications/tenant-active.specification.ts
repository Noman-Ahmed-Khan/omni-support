import type { TenantEntity } from '../tenant/entities/tenant.entity';

export class TenantActiveSpecification {
  isSatisfiedBy(tenant: TenantEntity): boolean {
    return tenant.status !== 'SUSPENDED' && tenant.status !== 'CANCELLED';
  }
}
