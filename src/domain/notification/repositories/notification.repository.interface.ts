import type { NotificationEntity } from '../entities/notification.entity';

export interface NotificationFilters {
  tenantId: string;
  userId?: string;
  customerId?: string;
  ticketId?: string;
  status?: string | string[];
  channel?: string | string[];
  read?: boolean;
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

export interface INotificationRepository {
  findById(id: string, tenantId: string): Promise<NotificationEntity | null>;
  findByUser(
    userId: string,
    tenantId: string,
    pagination: PaginationOptions,
    filters?: Omit<NotificationFilters, 'tenantId' | 'userId'>,
  ): Promise<PaginatedResult<NotificationEntity>>;
  save(notification: NotificationEntity): Promise<NotificationEntity>;
  update(notification: NotificationEntity): Promise<NotificationEntity>;
  markAsRead(id: string, tenantId: string, userId: string): Promise<void>;
  markAllAsRead(userId: string, tenantId: string): Promise<number>;
  countUnread(userId: string, tenantId: string): Promise<number>;
  delete(id: string, tenantId: string): Promise<void>;
  findDueNotifications(now?: Date): Promise<NotificationEntity[]>;
}
