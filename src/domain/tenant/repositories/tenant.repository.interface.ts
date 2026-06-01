import { TenantEntity } from '../entities/tenant.entity';

export interface TenantFilters {
  status?: string;
  plan?: string;
  search?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ITenantRepository {
  findById(id: string): Promise<TenantEntity | null>;
  findBySlug(slug: string): Promise<TenantEntity | null>;
  findByDomain(domain: string): Promise<TenantEntity | null>;
  findAll(
    filters: TenantFilters,
    page: number,
    limit: number
  ): Promise<PaginatedResult<TenantEntity>>;
  save(tenant: TenantEntity): Promise<TenantEntity>;
  update(tenant: TenantEntity): Promise<TenantEntity>;
  delete(id: string): Promise<void>;
  existsBySlug(slug: string): Promise<boolean>;
  existsByDomain(domain: string): Promise<boolean>;
  count(): Promise<number>;
}