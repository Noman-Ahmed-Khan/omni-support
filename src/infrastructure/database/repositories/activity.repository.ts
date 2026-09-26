import type {
  ActivityEventType,
  ActivityLog,
  Prisma,
  PrismaClient,
} from '@prisma/client';

import { InfrastructureError } from '../../../shared/errors/infrastructure.error';
import { toSkip, toTotalPages } from '../../../shared/utils/pagination.util';
import { resolveDatabaseClient, type DatabaseClient } from '../transaction-context';

export interface ActivityLogEntry {
  tenantId: string;
  ticketId?: string;
  customerId?: string;
  actorId?: string;
  actorRole?: string;
  eventType: ActivityEventType;
  description: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export class ActivityRepository {
  constructor(private readonly prismaClient: PrismaClient) {}

  /** Joins the caller's transaction when one is active (see TransactionManager). */
  private get prisma(): DatabaseClient {
    return resolveDatabaseClient(this.prismaClient);
  }

  async create(entry: ActivityLogEntry): Promise<void> {
    try {
      await this.prisma.activityLog.create({
        data: {
          tenantId: entry.tenantId,
          ticketId: entry.ticketId,
          customerId: entry.customerId,
          actorId: entry.actorId,
          actorRole: entry.actorRole,
          eventType: entry.eventType,
          description: entry.description,
          oldValue: toInputJson(entry.oldValue),
          newValue: toInputJson(entry.newValue),
          metadata: toInputJson(entry.metadata ?? {}),
        },
      });
    } catch (error) {
      throw new InfrastructureError('Failed to create activity log', { error });
    }
  }

  async findByTicket(
    ticketId: string,
    tenantId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{
    data: ActivityLog[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const skip = toSkip(page, limit);

      const [records, total] = await Promise.all([
        this.prisma.activityLog.findMany({
          where: { ticketId, tenantId },
          skip,
          take: limit,
          orderBy: { occurredAt: 'desc' },
        }),
        this.prisma.activityLog.count({ where: { ticketId, tenantId } }),
      ]);

      return {
        data: records,
        total,
        page,
        limit,
        totalPages: toTotalPages(total, limit),
      };
    } catch (error) {
      throw new InfrastructureError('Failed to find ticket activities', {
        error,
      });
    }
  }

  async findByCustomer(
    customerId: string,
    tenantId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{
    data: ActivityLog[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const skip = toSkip(page, limit);

      const [records, total] = await Promise.all([
        this.prisma.activityLog.findMany({
          where: { customerId, tenantId },
          skip,
          take: limit,
          orderBy: { occurredAt: 'desc' },
        }),
        this.prisma.activityLog.count({ where: { customerId, tenantId } }),
      ]);

      return {
        data: records,
        total,
        page,
        limit,
        totalPages: toTotalPages(total, limit),
      };
    } catch (error) {
      throw new InfrastructureError('Failed to find customer activities', {
        error,
      });
    }
  }
}

function toInputJson(
  value: Record<string, unknown> | undefined,
): Prisma.InputJsonValue | undefined {
  return value as Prisma.InputJsonValue | undefined;
}
