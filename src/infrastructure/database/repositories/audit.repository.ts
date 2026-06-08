import type { AuditAction, AuditLog, Prisma, PrismaClient } from '@prisma/client';

import { InfrastructureError } from '../../../shared/errors/infrastructure.error';
import { logger } from '../../../shared/utils/logger.util';

export interface AuditLogEntry {
  tenantId?: string;
  actorId?: string;
  actorRole?: string;
  action: string;
  resource: string;
  resourceId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

export class AuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(entry: AuditLogEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: entry.tenantId,
          actorId: entry.actorId,
          actorRole: entry.actorRole,
          action: entry.action as AuditAction,
          resource: entry.resource,
          resourceId: entry.resourceId,
          oldValue: toInputJson(entry.oldValue),
          newValue: toInputJson(entry.newValue),
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          correlationId: entry.correlationId,
          metadata: toInputJson(entry.metadata ?? {}),
        },
      });
    } catch (error) {
      // Audit log failures should not crash the application
      // but must be logged
      logger.error('AUDIT LOG FAILURE', { error });
    }
  }

  async findByTenant(
    tenantId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{
    data: AuditLog[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const skip = (page - 1) * limit;

      const [records, total] = await Promise.all([
        this.prisma.auditLog.findMany({
          where: { tenantId },
          skip,
          take: limit,
          orderBy: { occurredAt: 'desc' },
        }),
        this.prisma.auditLog.count({ where: { tenantId } }),
      ]);

      return {
        data: records,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      throw new InfrastructureError('Failed to find audit logs', { error });
    }
  }

  async findByResource(
    resource: string,
    resourceId: string,
    tenantId?: string,
  ): Promise<AuditLog[]> {
    try {
      return this.prisma.auditLog.findMany({
        where: { resource, resourceId, tenantId },
        orderBy: { occurredAt: 'desc' },
      });
    } catch (error) {
      throw new InfrastructureError('Failed to find resource audit logs', {
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
