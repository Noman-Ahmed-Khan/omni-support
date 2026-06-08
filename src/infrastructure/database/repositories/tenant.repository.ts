import type {
  PrismaClient,
  Tenant,
  TenantStatus as PrismaTenantStatus,
} from '@prisma/client';
import { Prisma } from '@prisma/client';

import type { TenantEntity } from '../../../domain/tenant/entities/tenant.entity';
import type {
  ITenantRepository,
  TenantFilters,
  PaginatedResult,
} from '../../../domain/tenant/repositories/tenant.repository.interface';
import { InfrastructureError } from '../../../shared/errors/infrastructure.error';
import { mapPrismaTenantToEntity } from '../../../shared/mappers/tenant.mapper';

export class TenantRepository implements ITenantRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<TenantEntity | null> {
    try {
      const record = await this.prisma.tenant.findUnique({
        where: { id },
      });

      return record ? this.toDomain(record) : null;
    } catch (error) {
      throw new InfrastructureError('Failed to find tenant by id', { error });
    }
  }

  async findBySlug(slug: string): Promise<TenantEntity | null> {
    try {
      const record = await this.prisma.tenant.findUnique({
        where: { slug },
      });

      return record ? this.toDomain(record) : null;
    } catch (error) {
      throw new InfrastructureError('Failed to find tenant by slug', { error });
    }
  }

  async findByDomain(domain: string): Promise<TenantEntity | null> {
    try {
      const record = await this.prisma.tenant.findUnique({
        where: { domain },
      });

      return record ? this.toDomain(record) : null;
    } catch (error) {
      throw new InfrastructureError('Failed to find tenant by domain', {
        error,
      });
    }
  }

  async findAll(
    filters: TenantFilters,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<TenantEntity>> {
    try {
      const where: Prisma.TenantWhereInput = {};

      if (filters.status) {
        where.status = filters.status as PrismaTenantStatus;
      }

      if (filters.plan) {
        where.plan = filters.plan;
      }

      if (filters.search) {
        where.OR = [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { slug: { contains: filters.search, mode: 'insensitive' } },
          { domain: { contains: filters.search, mode: 'insensitive' } },
        ];
      }

      const skip = (page - 1) * limit;

      const [records, total] = await Promise.all([
        this.prisma.tenant.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.tenant.count({ where }),
      ]);

      return {
        data: records.map((r) => this.toDomain(r)),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      throw new InfrastructureError('Failed to list tenants', { error });
    }
  }

  async save(tenant: TenantEntity): Promise<TenantEntity> {
    try {
      const record = await this.prisma.tenant.create({
        data: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status as PrismaTenantStatus,
          plan: tenant.plan,
          domain: tenant.domain,
          logoUrl: tenant.logoUrl,
          maxAgents: tenant.maxAgents,
          maxCustomers: tenant.maxCustomers,
          maxTicketsPerDay: tenant.maxTicketsPerDay,
          settings: toInputJson(tenant.settings),
          suspendedAt: tenant.suspendedAt,
          suspendedReason: tenant.suspendedReason,
        },
      });

      return this.toDomain(record);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new InfrastructureError('Tenant slug or domain already exists', {
          code: 'DUPLICATE',
        });
      }
      throw new InfrastructureError('Failed to save tenant', { error });
    }
  }

  async update(tenant: TenantEntity): Promise<TenantEntity> {
    try {
      const record = await this.prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          name: tenant.name,
          status: tenant.status as PrismaTenantStatus,
          plan: tenant.plan,
          domain: tenant.domain,
          logoUrl: tenant.logoUrl,
          maxAgents: tenant.maxAgents,
          maxCustomers: tenant.maxCustomers,
          maxTicketsPerDay: tenant.maxTicketsPerDay,
          settings: toInputJson(tenant.settings),
          suspendedAt: tenant.suspendedAt,
          suspendedReason: tenant.suspendedReason,
          updatedAt: new Date(),
        },
      });

      return this.toDomain(record);
    } catch (error) {
      throw new InfrastructureError('Failed to update tenant', { error });
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.tenant.delete({ where: { id } });
    } catch (error) {
      throw new InfrastructureError('Failed to delete tenant', { error });
    }
  }

  async existsBySlug(slug: string): Promise<boolean> {
    const count = await this.prisma.tenant.count({ where: { slug } });
    return count > 0;
  }

  async existsByDomain(domain: string): Promise<boolean> {
    const count = await this.prisma.tenant.count({ where: { domain } });
    return count > 0;
  }

  async count(): Promise<number> {
    return this.prisma.tenant.count();
  }

  private toDomain(record: Tenant): TenantEntity {
    return mapPrismaTenantToEntity(record);
  }
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
