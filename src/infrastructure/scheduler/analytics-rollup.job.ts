import type { AnalyticsService } from '../../application/analytics/services/analytics.service';
import type { ITenantRepository } from '../../domain/tenant/repositories/tenant.repository.interface';

const TENANT_PAGE_SIZE = 200;

export function createAnalyticsRollupJob(
  analyticsService: AnalyticsService,
  tenantRepository: ITenantRepository,
): () => Promise<void> {
  return async () => {
    for (let page = 1; ; page++) {
      const tenants = await tenantRepository.findAll({}, page, TENANT_PAGE_SIZE);

      // generateDailySnapshot logs and swallows its own failures, so one tenant
      // cannot stop the rollup for the others.
      for (const tenant of tenants.data) {
        await analyticsService.generateDailySnapshot(tenant.id);
      }

      if (page >= tenants.totalPages || tenants.data.length === 0) break;
    }
  };
}
