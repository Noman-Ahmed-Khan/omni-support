import type {
  Notification,
  NotificationChannel as PrismaNotificationChannel,
  NotificationStatus as PrismaNotificationStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';

import { NotificationEntity } from '../../../domain/notification/entities/notification.entity';
import type {
  INotificationRepository,
  NotificationFilters,
  PaginationOptions,
  PaginatedResult,
} from '../../../domain/notification/repositories/notification.repository.interface';
import { NotificationChannel } from '../../../domain/notification/value-objects/notification-channel.vo';

export class NotificationRepository implements INotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private mapToEntity(data: Notification): NotificationEntity {
    return NotificationEntity.reconstitute(data.id, {
      tenantId: data.tenantId,
      userId: data.userId ?? undefined,
      customerId: data.customerId ?? undefined,
      ticketId: data.ticketId ?? undefined,
      channel: NotificationChannel.create(data.channel),
      status: data.status,
      subject: data.subject ?? undefined,
      content: data.content,
      metadata: toMetadataRecord(data.metadata),
      scheduledAt: data.scheduledAt ?? undefined,
      sentAt: data.sentAt ?? undefined,
      deliveredAt: data.deliveredAt ?? undefined,
      failedAt: data.failedAt ?? undefined,
      failReason: data.failReason ?? undefined,
      retryCount: data.retryCount,
      maxRetries: data.maxRetries,
      readAt: data.readAt ?? undefined,
      createdAt: data.createdAt,
    });
  }

  async findById(id: string, tenantId: string): Promise<NotificationEntity | null> {
    const data = await this.prisma.notification.findFirst({
      where: { id, tenantId },
    });
    if (!data) return null;
    return this.mapToEntity(data);
  }

  async findByUser(
    userId: string,
    tenantId: string,
    pagination: PaginationOptions,
    filters?: Omit<NotificationFilters, 'tenantId' | 'userId'>,
  ): Promise<PaginatedResult<NotificationEntity>> {
    const where: Prisma.NotificationWhereInput = {
      tenantId,
      userId,
    };

    if (filters?.read !== undefined) {
      if (filters.read) {
        where.readAt = { not: null };
      } else {
        where.readAt = null;
      }
    }

    const skip = (pagination.page - 1) * pagination.limit;
    const orderBy = buildOrderBy(pagination.sortBy, pagination.sortOrder);

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: pagination.limit,
        orderBy,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data: data.map((n) => this.mapToEntity(n)),
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }

  async save(notification: NotificationEntity): Promise<NotificationEntity> {
    const data = await this.prisma.notification.create({
      data: {
        id: notification.id,
        tenantId: notification.tenantId,
        userId: notification.userId,
        customerId: notification.customerId,
        ticketId: notification.ticketId,
        channel: toNotificationChannel(notification.channel),
        status: toNotificationStatus(notification.status),
        subject: notification.subject,
        content: notification.content,
        metadata: toInputJson(notification.metadata),
        scheduledAt: notification.scheduledAt,
        sentAt: notification.sentAt,
        deliveredAt: notification.deliveredAt,
        failedAt: notification.failedAt,
        failReason: notification.failReason,
        retryCount: notification.retryCount,
        maxRetries: notification.maxRetries,
        readAt: notification.readAt,
      },
    });
    return this.mapToEntity(data);
  }

  async update(notification: NotificationEntity): Promise<NotificationEntity> {
    const data = await this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: toNotificationStatus(notification.status),
        scheduledAt: notification.scheduledAt,
        sentAt: notification.sentAt,
        deliveredAt: notification.deliveredAt,
        failedAt: notification.failedAt,
        failReason: notification.failReason,
        retryCount: notification.retryCount,
        readAt: notification.readAt,
      },
    });
    return this.mapToEntity(data);
  }

  async markAsRead(id: string, tenantId: string, userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id, tenantId, userId },
      data: { readAt: new Date(), status: 'READ' },
    });
  }

  async markAllAsRead(userId: string, tenantId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, tenantId, readAt: null },
      data: { readAt: new Date(), status: 'READ' },
    });
    return result.count;
  }

  async countUnread(userId: string, tenantId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, tenantId, readAt: null },
    });
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await this.prisma.notification.deleteMany({
      where: { id, tenantId },
    });
  }

  async findDueNotifications(now?: Date): Promise<NotificationEntity[]> {
    const data = await this.prisma.notification.findMany({
      where: {
        status: 'PENDING',
        scheduledAt: { lte: now || new Date() },
      },
    });
    return data.map((n) => this.mapToEntity(n));
  }
}

function buildOrderBy(
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'desc',
): Prisma.NotificationOrderByWithRelationInput {
  switch (sortBy) {
    case 'scheduledAt':
      return { scheduledAt: sortOrder };
    case 'sentAt':
      return { sentAt: sortOrder };
    case 'deliveredAt':
      return { deliveredAt: sortOrder };
    case 'failedAt':
      return { failedAt: sortOrder };
    case 'readAt':
      return { readAt: sortOrder };
    case 'status':
      return { status: sortOrder };
    case 'channel':
      return { channel: sortOrder };
    case 'createdAt':
    default:
      return { createdAt: sortOrder };
  }
}

function toMetadataRecord(value: Prisma.JsonValue): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNotificationChannel(value: string): PrismaNotificationChannel {
  return value as PrismaNotificationChannel;
}

function toNotificationStatus(value: string): PrismaNotificationStatus {
  return value as PrismaNotificationStatus;
}

function toInputJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
