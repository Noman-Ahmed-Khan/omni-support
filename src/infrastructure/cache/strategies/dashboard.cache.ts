import { CacheService } from '../cache.service';

export class DashboardCacheStrategy {
  private readonly TTL = 60; // 1 minute for dashboards

  constructor(private readonly cache: CacheService) {}

  async getDashboard<T>(tenantId: string, type: string): Promise<T | null> {
    return this.cache.get<T>(CacheService.dashboardKey(tenantId, type));
  }

  async setDashboard<T>(tenantId: string, type: string, data: T): Promise<void> {
    await this.cache.set(CacheService.dashboardKey(tenantId, type), data, {
      ttl: this.TTL,
    });
  }

  /** Clears dashboard and analytics caches, which are both derived from ticket data. */
  async invalidate(tenantId: string): Promise<void> {
    await Promise.all([
      this.cache.delPattern(`dashboard:${tenantId}:*`),
      this.cache.delPattern(`analytics:${tenantId}:*`),
    ]);
  }
}
