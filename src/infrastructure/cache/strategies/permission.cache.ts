import { CacheService } from '../cache.service';

export interface CachedPermissions {
  userId: string;
  role: string;
  permissions: string[];
  tenantId?: string;
  cachedAt: number;
}

export class PermissionCacheStrategy {
  private readonly TTL = 600; // 10 minutes

  constructor(private readonly cache: CacheService) {}

  async getPermissions(userId: string): Promise<CachedPermissions | null> {
    return this.cache.get<CachedPermissions>(CacheService.permissionKey(userId), {
      ttl: this.TTL,
    });
  }

  async setPermissions(permissions: CachedPermissions): Promise<void> {
    await this.cache.set(
      CacheService.permissionKey(permissions.userId),
      { ...permissions, cachedAt: Date.now() },
      { ttl: this.TTL },
    );
  }

  async invalidate(userId: string): Promise<void> {
    await this.cache.del(CacheService.permissionKey(userId));
  }
}
