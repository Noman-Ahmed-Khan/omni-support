import type { CacheService } from '../cache.service';

export class AnalyticsCacheStrategy {
  private readonly ttlSeconds = 300;

  constructor(private readonly cache: CacheService) {}

  async getDashboard<T>(tenantId: string, type: string): Promise<T | null> {
    return this.cache.get<T>(this.key(tenantId, type));
  }

  async setDashboard<T>(tenantId: string, type: string, value: T): Promise<void> {
    await this.cache.set(this.key(tenantId, type), value, {
      ttl: this.ttlSeconds,
    });
  }

  async getTrendData<T>(tenantId: string, days: number): Promise<T | null> {
    return this.cache.get<T>(this.key(tenantId, `trends:${days}`));
  }

  async setTrendData<T>(tenantId: string, days: number, value: T): Promise<void> {
    await this.cache.set(this.key(tenantId, `trends:${days}`), value, {
      ttl: this.ttlSeconds,
    });
  }

  async invalidate(tenantId: string): Promise<void> {
    await this.cache.delPattern(`analytics:${tenantId}:*`);
  }

  private key(tenantId: string, suffix: string): string {
    return `analytics:${tenantId}:${suffix}`;
  }
}
