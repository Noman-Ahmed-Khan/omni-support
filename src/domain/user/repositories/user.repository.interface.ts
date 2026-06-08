import type { UserEntity } from '../entities/user.entity';

export interface UserFilters {
  tenantId?: string | null;
  role?: string | string[];
  status?: string | string[];
  search?: string;
}

export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface IUserRepository {
  findById(id: string, tenantId?: string | null): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  findAll(
    filters: UserFilters,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<UserEntity>>;
  save(user: UserEntity): Promise<UserEntity>;
  update(user: UserEntity): Promise<UserEntity>;
  delete(id: string): Promise<void>;
  countByTenantId(tenantId: string): Promise<number>;
  findByTenantId(tenantId: string): Promise<UserEntity[]>;
  existsByEmail(email: string): Promise<boolean>;
}
