export interface NotificationResponse {
  id: string;
  tenantId: string;
  userId?: string;
  customerId?: string;
  ticketId?: string;
  channel: string;
  status: string;
  subject?: string;
  content: string;
  metadata: Record<string, unknown>;
  scheduledAt?: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  failedAt?: Date;
  failReason?: string;
  retryCount: number;
  maxRetries: number;
  readAt?: Date;
  createdAt: Date;
}

export function mapNotificationRecordToResponse(notification: {
  id: string;
  tenantId: string;
  userId: string | null;
  customerId: string | null;
  ticketId: string | null;
  channel: string;
  status: string;
  subject: string | null;
  content: string;
  metadata: unknown;
  scheduledAt: Date | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  failedAt: Date | null;
  failReason: string | null;
  retryCount: number;
  maxRetries: number;
  readAt: Date | null;
  createdAt: Date;
}): NotificationResponse {
  return {
    id: notification.id,
    tenantId: notification.tenantId,
    userId: notification.userId ?? undefined,
    customerId: notification.customerId ?? undefined,
    ticketId: notification.ticketId ?? undefined,
    channel: notification.channel,
    status: notification.status,
    subject: notification.subject ?? undefined,
    content: notification.content,
    metadata: (notification.metadata as Record<string, unknown>) ?? {},
    scheduledAt: notification.scheduledAt ?? undefined,
    sentAt: notification.sentAt ?? undefined,
    deliveredAt: notification.deliveredAt ?? undefined,
    failedAt: notification.failedAt ?? undefined,
    failReason: notification.failReason ?? undefined,
    retryCount: notification.retryCount,
    maxRetries: notification.maxRetries,
    readAt: notification.readAt ?? undefined,
    createdAt: notification.createdAt,
  };
}
