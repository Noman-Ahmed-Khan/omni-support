import { ITenantRepository } from '../../domain/tenant/repositories/tenant.repository.interface';

export function createTenantCleanupJob(
  tenantRepository: ITenantRepository,
): () => Promise<void> {
  return async () => {
    const tenants = await tenantRepository.findAll({ status: 'CANCELLED' }, 1, 1000);
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;

    for (const tenant of tenants.data) {
      if (tenant.suspendedAt && tenant.suspendedAt.getTime() < cutoff) {
        await tenantRepository.delete(tenant.id);
      }
    }
  };
}
