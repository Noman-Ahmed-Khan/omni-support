import type { AnalyticsService } from '../../application/analytics/services/analytics.service';
import type { ITenantRepository } from '../../domain/tenant/repositories/tenant.repository.interface';

export function createAnalyticsRollupJob(
  analyticsService: AnalyticsService,
  tenantRepository: ITenantRepository,
): () => Promise<void> {
  return async () => {
    const tenants = await tenantRepository.findAll({}, 1, 1000);

    for (const tenant of tenants.data) {
      await analyticsService.generateDailySnapshot(tenant.id);
    }
  };
}
