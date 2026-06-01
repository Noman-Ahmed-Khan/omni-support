import { CustomerEntity } from '../entities/customer.entity';

export interface CustomerFilters {
  tenantId: string;
  status?: string;
  assignedAgentId?: string;
  search?: string;
  riskLabel?: string;
  dateFrom?: Date;
  dateTo?: Date;
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

export interface ICustomerRepository {
  findById(id: string, tenantId: string): Promise<CustomerEntity | null>;
  findByEmail(email: string, tenantId: string): Promise<CustomerEntity | null>;
  findAll(
    filters: CustomerFilters,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<CustomerEntity>>;
  save(customer: CustomerEntity): Promise<CustomerEntity>;
  update(customer: CustomerEntity): Promise<CustomerEntity>;
  delete(id: string, tenantId: string): Promise<void>;
  existsByEmail(email: string, tenantId: string): Promise<boolean>;
  countByTenantId(tenantId: string): Promise<number>;
  findHighRiskCustomers(tenantId: string): Promise<CustomerEntity[]>;
}
