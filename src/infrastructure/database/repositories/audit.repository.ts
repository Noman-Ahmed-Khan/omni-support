import { PrismaClient } from '@prisma/client';
import { InfrastructureError } from '../../../shared/errors/infrastructure.error';

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
          action: entry.action as any,
          resource: entry.resource,
          resourceId: entry.resourceId,
          oldValue: entry.oldValue as any,
          newValue: entry.newValue as any,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          correlationId: entry.correlationId,
          metadata: (entry.metadata ?? {}) as any,
        },
      });
    } catch (error) {
      // Audit log failures should not crash the application
      // but must be logged to stderr
      console.error('AUDIT LOG FAILURE:', error);
    }
  }

  async findByTenant(
    tenantId: string,
    page: number = 1,
    limit: number = 50,
  ) {
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
  ) {
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