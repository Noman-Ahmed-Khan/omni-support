import type {
  PrismaClient,
  Prisma,
  User as PrismaUser,
  UserRole as PrismaUserRole,
  UserStatus as PrismaUserStatus,
} from '@prisma/client';

import { UserEntity } from '../../../domain/user/entities/user.entity';
import type { UserStatusEnum } from '../../../domain/user/entities/user.entity';
import type {
  IUserRepository,
  UserFilters,
  PaginationOptions,
  PaginatedResult,
} from '../../../domain/user/repositories/user.repository.interface';
import { Email } from '../../../domain/user/value-objects/email.vo';
import { UserRole } from '../../../domain/user/value-objects/user-role.vo';

export class UserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string, tenantId?: string | null): Promise<UserEntity | null> {
    const whereClause: Prisma.UserWhereInput = { id };
    if (tenantId !== undefined) {
      whereClause.tenantId = tenantId;
    }

    const user = await this.prisma.user.findFirst({
      where: whereClause,
    });

    if (!user) return null;
    return this.mapToEntity(user);
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) return null;
    return this.mapToEntity(user);
  }

  async findAll(
    filters: UserFilters,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<UserEntity>> {
    const where: Prisma.UserWhereInput = {};

    if (filters.tenantId !== undefined) {
      where.tenantId = filters.tenantId;
    }

    if (filters.role) {
      where.role = Array.isArray(filters.role)
        ? { in: filters.role.map(toUserRole) }
        : toUserRole(filters.role);
    }

    if (filters.status) {
      where.status = Array.isArray(filters.status)
        ? { in: filters.status.map(toUserStatus) }
        : toUserStatus(filters.status);
    }

    if (filters.search) {
      where.OR = [
        { email: { contains: filters.search, mode: 'insensitive' } },
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const orderBy = buildOrderBy(pagination.sortBy, pagination.sortOrder);

    const skip = (pagination.page - 1) * pagination.limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: pagination.limit,
        orderBy,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((u) => this.mapToEntity(u)),
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }

  async save(user: UserEntity): Promise<UserEntity> {
    const data: Prisma.UserCreateInput = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: toUserRole(user.role),
      status: toUserStatus(user.status),
      timezone: user.timezone,
      locale: user.locale,
      failedLoginAttempts: user.failedLoginAttempts,
      tenant: user.tenantId ? { connect: { id: user.tenantId } } : undefined,
      passwordHash: user.passwordHash ?? undefined,
      avatarUrl: user.avatarUrl ?? undefined,
      phone: user.phone ?? undefined,
      emailVerifiedAt: user.emailVerifiedAt ?? undefined,
      lastLoginAt: user.lastLoginAt ?? undefined,
      lastLoginIp: user.lastLoginIp ?? undefined,
      lockedUntil: user.lockedUntil ?? undefined,
    };

    const saved = await this.prisma.user.create({ data });
    return this.mapToEntity(saved);
  }

  async update(user: UserEntity): Promise<UserEntity> {
    const data: Prisma.UserUpdateInput = {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: toUserRole(user.role),
      status: toUserStatus(user.status),
      timezone: user.timezone,
      locale: user.locale,
      failedLoginAttempts: user.failedLoginAttempts,
      tenant: user.tenantId ? { connect: { id: user.tenantId } } : { disconnect: true },
      passwordHash: user.passwordHash ?? null,
      avatarUrl: user.avatarUrl ?? null,
      phone: user.phone ?? null,
      emailVerifiedAt: user.emailVerifiedAt ?? null,
      lastLoginAt: user.lastLoginAt ?? null,
      lastLoginIp: user.lastLoginIp ?? null,
      lockedUntil: user.lockedUntil ?? null,
    };

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data,
    });
    return this.mapToEntity(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.user.delete({
      where: { id },
    });
  }

  async countByTenantId(tenantId: string): Promise<number> {
    return this.prisma.user.count({
      where: { tenantId },
    });
  }

  async findByTenantId(tenantId: string): Promise<UserEntity[]> {
    const users = await this.prisma.user.findMany({
      where: { tenantId },
    });
    return users.map((u) => this.mapToEntity(u));
  }

  async existsByEmail(email: string): Promise<boolean> {
    const count = await this.prisma.user.count({
      where: { email: email.toLowerCase() },
    });
    return count > 0;
  }

  private mapToEntity(userModel: PrismaUser): UserEntity {
    return UserEntity.reconstitute(userModel.id, {
      tenantId: userModel.tenantId ?? undefined,
      email: Email.create(userModel.email),
      passwordHash: userModel.passwordHash ?? undefined,
      firstName: userModel.firstName,
      lastName: userModel.lastName,
      role: UserRole.create(userModel.role),
      status: userModel.status as UserStatusEnum,
      avatarUrl: userModel.avatarUrl ?? undefined,
      phone: userModel.phone ?? undefined,
      timezone: userModel.timezone,
      locale: userModel.locale,
      emailVerifiedAt: userModel.emailVerifiedAt ?? undefined,
      lastLoginAt: userModel.lastLoginAt ?? undefined,
      lastLoginIp: userModel.lastLoginIp ?? undefined,
      failedLoginAttempts: userModel.failedLoginAttempts,
      lockedUntil: userModel.lockedUntil ?? undefined,
      createdAt: userModel.createdAt,
      updatedAt: userModel.updatedAt,
    });
  }
}

function buildOrderBy(
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'desc',
): Prisma.UserOrderByWithRelationInput {
  switch (sortBy) {
    case 'updatedAt':
      return { updatedAt: sortOrder };
    case 'email':
      return { email: sortOrder };
    case 'firstName':
      return { firstName: sortOrder };
    case 'lastName':
      return { lastName: sortOrder };
    case 'role':
      return { role: sortOrder };
    case 'status':
      return { status: sortOrder };
    case 'createdAt':
    default:
      return { createdAt: sortOrder };
  }
}

function toUserRole(value: string): PrismaUserRole {
  return value as PrismaUserRole;
}

function toUserStatus(value: string): PrismaUserStatus {
  return value as PrismaUserStatus;
}
