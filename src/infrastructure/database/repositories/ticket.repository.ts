import {
  PrismaClient,
  Prisma,
  Ticket,
  TicketCategory as PrismaTicketCategory,
  TicketPriority as PrismaTicketPriority,
  TicketStatus as PrismaTicketStatus,
} from '@prisma/client';
import {
  ITicketRepository,
  TicketFilters,
  PaginationOptions,
  PaginatedResult,
} from '../../../domain/ticket/repositories/ticket.repository.interface';
import { TicketEntity } from '../../../domain/ticket/entities/ticket.entity';
import { TicketStatus } from '../../../domain/ticket/value-objects/ticket-status.vo';
import { TicketPriority } from '../../../domain/ticket/value-objects/ticket-priority.vo';
import { InfrastructureError } from '../../../shared/errors/infrastructure.error';

export class TicketRepository implements ITicketRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string, tenantId: string): Promise<TicketEntity | null> {
    try {
      const record = await this.prisma.ticket.findFirst({
        where: { id, tenantId },
      });

      return record ? this.toDomain(record) : null;
    } catch (error) {
      throw new InfrastructureError('Failed to find ticket', { error });
    }
  }

  async findByTicketNumber(
    ticketNumber: number,
    tenantId: string,
  ): Promise<TicketEntity | null> {
    try {
      const record = await this.prisma.ticket.findFirst({
        where: { ticketNumber, tenantId },
      });

      return record ? this.toDomain(record) : null;
    } catch (error) {
      throw new InfrastructureError('Failed to find ticket by number', {
        error,
      });
    }
  }

  async findAll(
    filters: TicketFilters,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<TicketEntity>> {
    try {
      const where = this.buildWhereClause(filters);
      const skip = (pagination.page - 1) * pagination.limit;

      const orderBy = this.buildOrderBy(
        pagination.sortBy,
        pagination.sortOrder,
      );

      const [records, total] = await Promise.all([
        this.prisma.ticket.findMany({
          where,
          skip,
          take: pagination.limit,
          orderBy,
        }),
        this.prisma.ticket.count({ where }),
      ]);

      return {
        data: records.map((r) => this.toDomain(r)),
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.ceil(total / pagination.limit),
      };
    } catch (error) {
      throw new InfrastructureError('Failed to list tickets', { error });
    }
  }

  async findByAgentId(
    agentId: string,
    tenantId: string,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<TicketEntity>> {
    return this.findAll(
      { tenantId, assignedAgentId: agentId },
      pagination,
    );
  }

  async findByCustomerId(
    customerId: string,
    tenantId: string,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<TicketEntity>> {
    return this.findAll({ tenantId, customerId }, pagination);
  }

  async save(ticket: TicketEntity): Promise<TicketEntity> {
    try {
      const record = await this.prisma.ticket.create({
        data: {
          id: ticket.id,
          tenantId: ticket.tenantId,
          ticketNumber: ticket.ticketNumber,
          customerId: ticket.customerId,
          assignedAgentId: ticket.assignedAgentId,
          createdById: ticket.createdById,
          title: ticket.title,
          description: ticket.description,
          status: ticket.status as PrismaTicketStatus,
          priority: ticket.priority as PrismaTicketPriority,
          category: ticket.category as PrismaTicketCategory,
          tags: ticket.tags,
          source: ticket.source,
          isEscalated: ticket.isEscalated,
          escalatedAt: ticket.escalatedAt,
          escalatedReason: ticket.escalatedReason,
          resolvedAt: ticket.resolvedAt,
          closedAt: ticket.closedAt,
          firstResponseAt: ticket.firstResponseAt,
          dueAt: ticket.dueAt,
          slaBreached: ticket.slaBreached,
          metadata: toInputJson(ticket.metadata),
        },
      });

      return this.toDomain(record);
    } catch (error) {
      throw new InfrastructureError('Failed to save ticket', { error });
    }
  }

  async update(ticket: TicketEntity): Promise<TicketEntity> {
    try {
      const record = await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          assignedAgentId: ticket.assignedAgentId,
          title: ticket.title,
          description: ticket.description,
          status: ticket.status as PrismaTicketStatus,
          priority: ticket.priority as PrismaTicketPriority,
          category: ticket.category as PrismaTicketCategory,
          tags: ticket.tags,
          isEscalated: ticket.isEscalated,
          escalatedAt: ticket.escalatedAt,
          escalatedReason: ticket.escalatedReason,
          resolvedAt: ticket.resolvedAt,
          closedAt: ticket.closedAt,
          firstResponseAt: ticket.firstResponseAt,
          dueAt: ticket.dueAt,
          slaBreached: ticket.slaBreached,
          metadata: toInputJson(ticket.metadata),
          updatedAt: new Date(),
        },
      });

      return this.toDomain(record);
    } catch (error) {
      throw new InfrastructureError('Failed to update ticket', { error });
    }
  }

  async delete(id: string, tenantId: string): Promise<void> {
    try {
      await this.prisma.ticket.deleteMany({ where: { id, tenantId } });
    } catch (error) {
      throw new InfrastructureError('Failed to delete ticket', { error });
    }
  }

  async getNextTicketNumber(tenantId: string): Promise<number> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const sequence = await tx.ticketSequence.upsert({
          where: { tenantId },
          update: { lastNumber: { increment: 1 } },
          create: { tenantId, lastNumber: 1 },
        });
        return sequence.lastNumber;
      });

      return result;
    } catch (error) {
      throw new InfrastructureError('Failed to get next ticket number', {
        error,
      });
    }
  }

  async countByTenantId(tenantId: string): Promise<number> {
    return this.prisma.ticket.count({ where: { tenantId } });
  }

  async countByStatus(tenantId: string): Promise<Record<string, number>> {
    const results = await this.prisma.ticket.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: { status: true },
    });

    return results.reduce(
      (acc, r) => ({
        ...acc,
        [r.status]: r._count.status,
      }),
      {} as Record<string, number>,
    );
  }

  async countByPriority(tenantId: string): Promise<Record<string, number>> {
    const results = await this.prisma.ticket.groupBy({
      by: ['priority'],
      where: { tenantId },
      _count: { priority: true },
    });

    return results.reduce(
      (acc, r) => ({
        ...acc,
        [r.priority]: r._count.priority,
      }),
      {} as Record<string, number>,
    );
  }

  async findOverdueTickets(tenantId: string): Promise<TicketEntity[]> {
    const records = await this.prisma.ticket.findMany({
      where: {
        tenantId,
        dueAt: { lt: new Date() },
        status: { notIn: ['RESOLVED', 'CLOSED'] },
        slaBreached: false,
      },
    });

    return records.map((r) => this.toDomain(r));
  }

  async findEscalatedTickets(tenantId: string): Promise<TicketEntity[]> {
    const records = await this.prisma.ticket.findMany({
      where: {
        tenantId,
        isEscalated: true,
        status: { notIn: ['RESOLVED', 'CLOSED'] },
      },
      orderBy: { escalatedAt: 'asc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  private buildWhereClause(filters: TicketFilters): Prisma.TicketWhereInput {
    const where: Prisma.TicketWhereInput = {
      tenantId: filters.tenantId,
    };

    if (filters.status) {
      where.status = Array.isArray(filters.status)
        ? { in: filters.status as PrismaTicketStatus[] }
        : (filters.status as PrismaTicketStatus);
    }

    if (filters.priority) {
      where.priority = Array.isArray(filters.priority)
        ? { in: filters.priority as PrismaTicketPriority[] }
        : (filters.priority as PrismaTicketPriority);
    }

    if (filters.category) {
      where.category = filters.category as PrismaTicketCategory;
    }

    if (filters.assignedAgentId) {
      where.assignedAgentId = filters.assignedAgentId;
    }

    if (filters.customerId) {
      where.customerId = filters.customerId;
    }

    if (filters.isEscalated !== undefined) {
      where.isEscalated = filters.isEscalated;
    }

    if (filters.slaBreached !== undefined) {
      where.slaBreached = filters.slaBreached;
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
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (filters.tags && filters.tags.length > 0) {
      where.tags = { hasSome: filters.tags };
    }

    return where;
  }

  private buildOrderBy(
    sortBy?: string,
    sortOrder: 'asc' | 'desc' = 'desc',
  ): Prisma.TicketOrderByWithRelationInput {
    const validSortFields: Record<
      string,
      Prisma.TicketOrderByWithRelationInput
    > = {
      createdAt: { createdAt: sortOrder },
      updatedAt: { updatedAt: sortOrder },
      priority: { priority: sortOrder },
      status: { status: sortOrder },
      ticketNumber: { ticketNumber: sortOrder },
      dueAt: { dueAt: sortOrder },
    };

    return validSortFields[sortBy ?? 'createdAt'] ?? { createdAt: 'desc' };
  }

  private toDomain(record: Ticket): TicketEntity {
    return TicketEntity.reconstitute(record.id, {
      tenantId: record.tenantId,
      ticketNumber: record.ticketNumber,
      customerId: record.customerId,
      assignedAgentId: record.assignedAgentId ?? undefined,
      createdById: record.createdById,
      title: record.title,
      description: record.description,
      status: TicketStatus.create(record.status),
      priority: TicketPriority.create(record.priority),
      category: record.category,
      tags: record.tags ?? [],
      source: record.source,
      isEscalated: record.isEscalated,
      escalatedAt: record.escalatedAt ?? undefined,
      escalatedReason: record.escalatedReason ?? undefined,
      resolvedAt: record.resolvedAt ?? undefined,
      closedAt: record.closedAt ?? undefined,
      firstResponseAt: record.firstResponseAt ?? undefined,
      dueAt: record.dueAt ?? undefined,
      slaBreached: record.slaBreached,
      metadata: (record.metadata as Record<string, unknown>) ?? {},
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
