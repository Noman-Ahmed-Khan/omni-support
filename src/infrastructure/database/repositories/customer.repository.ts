import {
  Customer,
  CustomerStatus as PrismaCustomerStatus,
  PrismaClient,
  Prisma,
} from '@prisma/client';
import {
  CustomerFilters,
  ICustomerRepository,
  PaginatedResult,
  PaginationOptions,
} from '../../../domain/customer/repositories/customer.repository.interface';
import { CustomerEntity } from '../../../domain/customer/entities/customer.entity';
import { CustomerStatusEnum } from '../../../domain/customer/entities/customer.entity';
import { Email } from '../../../domain/user/value-objects/email.vo';
import { InfrastructureError } from '../../../shared/errors/infrastructure.error';

export class CustomerRepository implements ICustomerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string, tenantId: string): Promise<CustomerEntity | null> {
    try {
      const record = await this.prisma.customer.findFirst({
        where: { id, tenantId },
      });

      return record ? this.toDomain(record) : null;
    } catch (error) {
      throw new InfrastructureError('Failed to find customer', { error });
    }
  }

  async findByEmail(email: string, tenantId: string): Promise<CustomerEntity | null> {
    try {
      const record = await this.prisma.customer.findFirst({
        where: { email: email.toLowerCase(), tenantId },
      });

      return record ? this.toDomain(record) : null;
    } catch (error) {
      throw new InfrastructureError('Failed to find customer by email', {
        error,
      });
    }
  }

  async findAll(
    filters: CustomerFilters,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<CustomerEntity>> {
    try {
      const where = this.buildWhereClause(filters);
      const skip = (pagination.page - 1) * pagination.limit;
      const orderBy = this.buildOrderBy(pagination.sortBy, pagination.sortOrder);

      const [records, total] = await Promise.all([
        this.prisma.customer.findMany({ where, skip, take: pagination.limit, orderBy }),
        this.prisma.customer.count({ where }),
      ]);

      return {
        data: records.map((r) => this.toDomain(r)),
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.ceil(total / pagination.limit),
      };
    } catch (error) {
      throw new InfrastructureError('Failed to list customers', { error });
    }
  }

  async save(customer: CustomerEntity): Promise<CustomerEntity> {
    try {
      const record = await this.prisma.customer.create({
        data: {
          id: customer.id,
          tenantId: customer.tenantId,
          assignedAgentId: customer.assignedAgentId,
          fullName: customer.fullName,
          email: customer.email,
          phone: customer.phone,
          company: customer.company,
          notes: customer.notes,
          status: customer.status as PrismaCustomerStatus,
          riskScore: customer.riskScore,
          riskLabel: customer.riskLabel,
          metadata: toInputJson(customer.metadata),
          externalId: customer.externalId,
        },
      });

      return this.toDomain(record);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new InfrastructureError('Customer email already exists for this tenant', {
          code: 'DUPLICATE',
        });
      }
      throw new InfrastructureError('Failed to save customer', { error });
    }
  }

  async update(customer: CustomerEntity): Promise<CustomerEntity> {
    try {
      const record = await this.prisma.customer.update({
        where: { id: customer.id },
        data: {
          assignedAgentId: customer.assignedAgentId,
          fullName: customer.fullName,
          phone: customer.phone,
          company: customer.company,
          notes: customer.notes,
          status: customer.status as PrismaCustomerStatus,
          riskScore: customer.riskScore,
          riskLabel: customer.riskLabel,
          metadata: toInputJson(customer.metadata),
          lastActivityAt: customer.lastActivityAt,
          updatedAt: new Date(),
        },
      });

      return this.toDomain(record);
    } catch (error) {
      throw new InfrastructureError('Failed to update customer', { error });
    }
  }

  async delete(id: string, tenantId: string): Promise<void> {
    try {
      await this.prisma.customer.deleteMany({ where: { id, tenantId } });
    } catch (error) {
      throw new InfrastructureError('Failed to delete customer', { error });
    }
  }

  async existsByEmail(email: string, tenantId: string): Promise<boolean> {
    const count = await this.prisma.customer.count({
      where: { email: email.toLowerCase(), tenantId },
    });
    return count > 0;
  }

  async countByTenantId(tenantId: string): Promise<number> {
    return this.prisma.customer.count({ where: { tenantId } });
  }

  async findHighRiskCustomers(tenantId: string): Promise<CustomerEntity[]> {
    const records = await this.prisma.customer.findMany({
      where: { tenantId, riskScore: { gte: 70 } },
      orderBy: { riskScore: 'desc' },
      take: 50,
    });

    return records.map((r) => this.toDomain(r));
  }

  private buildWhereClause(filters: CustomerFilters): Prisma.CustomerWhereInput {
    const where: Prisma.CustomerWhereInput = {
      tenantId: filters.tenantId,
    };

    if (filters.status) {
      where.status = filters.status as PrismaCustomerStatus;
    }

    if (filters.assignedAgentId) {
      where.assignedAgentId = filters.assignedAgentId;
    }

    if (filters.riskLabel) {
      where.riskLabel = filters.riskLabel;
    }

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {
        ...(filters.dateFrom && { gte: filters.dateFrom }),
        ...(filters.dateTo && { lte: filters.dateTo }),
      };
    }

    if (filters.search) {
      const search = filters.search.trim();
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private buildOrderBy(
    sortBy?: string,
    sortOrder: 'asc' | 'desc' = 'desc',
  ): Prisma.CustomerOrderByWithRelationInput {
    const validSortFields: Record<string, Prisma.CustomerOrderByWithRelationInput> = {
      createdAt: { createdAt: sortOrder },
      updatedAt: { updatedAt: sortOrder },
      fullName: { fullName: sortOrder },
      riskScore: { riskScore: sortOrder },
      lastActivityAt: { lastActivityAt: sortOrder },
    };

    return validSortFields[sortBy ?? 'createdAt'] ?? { createdAt: 'desc' };
  }

  private toDomain(record: Customer): CustomerEntity {
    return CustomerEntity.reconstitute(record.id, {
      tenantId: record.tenantId,
      assignedAgentId: record.assignedAgentId ?? undefined,
      fullName: record.fullName,
      email: Email.create(record.email),
      phone: record.phone ?? undefined,
      company: record.company ?? undefined,
      notes: record.notes ?? undefined,
      status: record.status as CustomerStatusEnum,
      riskScore: record.riskScore ?? 0,
      riskLabel: record.riskLabel ?? undefined,
      metadata: (record.metadata as Record<string, unknown>) ?? {},
      externalId: record.externalId ?? undefined,
      lastActivityAt: record.lastActivityAt ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
