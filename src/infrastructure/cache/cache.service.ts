import { RedisClientType } from 'redis';
import { logger } from '../../shared/utils/logger.util';

export interface CacheOptions {
  ttl?: number; // seconds
  prefix?: string;
}

export class CacheService {
  private readonly defaultTTL = 300; // 5 minutes

  constructor(private readonly redis: RedisClientType) {}

  private buildKey(key: string, prefix?: string): string {
    return prefix ? `${prefix}:${key}` : key;
  }

  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    try {
      const fullKey = this.buildKey(key, options?.prefix);
      const value = await this.redis.get(fullKey);

      if (!value) return null;

      return JSON.parse(value) as T;
    } catch (error) {
      logger.warn('Cache get failed', { key, error });
      return null; // Cache miss on error - graceful degradation
    }
  }

  async set<T>(
    key: string,
    value: T,
    options?: CacheOptions,
  ): Promise<void> {
    try {
      const fullKey = this.buildKey(key, options?.prefix);
      const ttl = options?.ttl ?? this.defaultTTL;

      await this.redis.setEx(fullKey, ttl, JSON.stringify(value));
    } catch (error) {
      logger.warn('Cache set failed', { key, error });
      // Don't throw - cache failure should not break business logic
    }
  }

  async del(key: string, options?: CacheOptions): Promise<void> {
    try {
      const fullKey = this.buildKey(key, options?.prefix);
      await this.redis.del(fullKey);
    } catch (error) {
      logger.warn('Cache delete failed', { key, error });
    }
  }

  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(keys);
      }
    } catch (error) {
      logger.warn('Cache pattern delete failed', { pattern, error });
    }
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options?: CacheOptions,
  ): Promise<T> {
    const cached = await this.get<T>(key, options);
    if (cached !== null) return cached;

    const value = await factory();
    await this.set(key, value, options);
    return value;
  }

  async invalidateTenant(tenantId: string): Promise<void> {
    await this.delPattern(`tenant:${tenantId}:*`);
  }

  async invalidateUser(userId: string): Promise<void> {
    await this.delPattern(`user:${userId}:*`);
  }

  async exists(key: string, options?: CacheOptions): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, options?.prefix);
      const count = await this.redis.exists(fullKey);
      return count > 0;
    } catch (error) {
      return false;
    }
  }

  async increment(key: string, options?: CacheOptions): Promise<number> {
    const fullKey = this.buildKey(key, options?.prefix);
    return this.redis.incr(fullKey);
  }

  async expire(key: string, ttl: number): Promise<void> {
    await this.redis.expire(key, ttl);
  }

  // Tenant-aware cache key builder
  static tenantKey(tenantId: string, resource: string, id?: string): string {
    return id
      ? `tenant:${tenantId}:${resource}:${id}`
      : `tenant:${tenantId}:${resource}`;
  }

  // Permission cache key
  static permissionKey(userId: string): string {
    return `permissions:${userId}`;
  }

  // Dashboard cache key
  static dashboardKey(tenantId: string, type: string): string {
    return `dashboard:${tenantId}:${type}`;
  }
}