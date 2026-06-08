import { BaseEntity } from '../../shared/base.entity';
import type { NotificationChannel } from '../value-objects/notification-channel.vo';

export enum NotificationStatusEnum {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  READ = 'READ',
}

export interface NotificationProps {
  tenantId: string;
  userId?: string;
  customerId?: string;
  ticketId?: string;
  channel: NotificationChannel;
  status: NotificationStatusEnum | string;
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
  createdAt?: Date;
}

export class NotificationEntity extends BaseEntity {
  private _tenantId: string;
  private _userId?: string;
  private _customerId?: string;
  private _ticketId?: string;
  private _channel: NotificationChannel;
  private _status: NotificationStatusEnum;
  private _subject?: string;
  private _content: string;
  private _metadata: Record<string, unknown>;
  private _scheduledAt?: Date;
  private _sentAt?: Date;
  private _deliveredAt?: Date;
  private _failedAt?: Date;
  private _failReason?: string;
  private _retryCount: number;
  private _maxRetries: number;
  private _readAt?: Date;

  private constructor(id: string, props: NotificationProps) {
    super(id, props.createdAt);
    this._tenantId = props.tenantId;
    this._userId = props.userId;
    this._customerId = props.customerId;
    this._ticketId = props.ticketId;
    this._channel = props.channel;
    this._status =
      NotificationStatusEnum[props.status as keyof typeof NotificationStatusEnum] ??
      NotificationStatusEnum.PENDING;
    this._subject = props.subject;
    this._content = props.content;
    this._metadata = props.metadata;
    this._scheduledAt = props.scheduledAt;
    this._sentAt = props.sentAt;
    this._deliveredAt = props.deliveredAt;
    this._failedAt = props.failedAt;
    this._failReason = props.failReason;
    this._retryCount = props.retryCount;
    this._maxRetries = props.maxRetries;
    this._readAt = props.readAt;
  }

  static create(id: string, props: NotificationProps): NotificationEntity {
    return new NotificationEntity(id, props);
  }

  static reconstitute(id: string, props: NotificationProps): NotificationEntity {
    return new NotificationEntity(id, props);
  }

  markAsSent(sentAt: Date = new Date()): void {
    this._status = NotificationStatusEnum.SENT;
    this._sentAt = sentAt;
    this.updatedAt = sentAt;
  }

  markAsDelivered(deliveredAt: Date = new Date()): void {
    this._status = NotificationStatusEnum.DELIVERED;
    this._deliveredAt = deliveredAt;
    this.updatedAt = deliveredAt;
  }

  markAsFailed(reason: string, failedAt: Date = new Date()): void {
    this._status = NotificationStatusEnum.FAILED;
    this._failedAt = failedAt;
    this._failReason = reason;
    this._retryCount += 1;
    this.updatedAt = failedAt;
  }

  markAsRead(readAt: Date = new Date()): void {
    this._status = NotificationStatusEnum.READ;
    this._readAt = readAt;
    this.updatedAt = readAt;
  }

  schedule(scheduledAt: Date): void {
    this._scheduledAt = scheduledAt;
    this._status = NotificationStatusEnum.PENDING;
    this.updatedAt = scheduledAt;
  }

  canRetry(): boolean {
    return (
      this._status === NotificationStatusEnum.FAILED &&
      this._retryCount < this._maxRetries
    );
  }

  isRead(): boolean {
    return Boolean(this._readAt);
  }

  get tenantId(): string {
    return this._tenantId;
  }

  get userId(): string | undefined {
    return this._userId;
  }

  get customerId(): string | undefined {
    return this._customerId;
  }

  get ticketId(): string | undefined {
    return this._ticketId;
  }

  get channel(): string {
    return this._channel.toString();
  }

  get status(): string {
    return this._status;
  }

  get subject(): string | undefined {
    return this._subject;
  }

  get content(): string {
    return this._content;
  }

  get metadata(): Record<string, unknown> {
    return { ...this._metadata };
  }

  get scheduledAt(): Date | undefined {
    return this._scheduledAt;
  }

  get sentAt(): Date | undefined {
    return this._sentAt;
  }

  get deliveredAt(): Date | undefined {
    return this._deliveredAt;
  }

  get failedAt(): Date | undefined {
    return this._failedAt;
  }

  get failReason(): string | undefined {
    return this._failReason;
  }

  get retryCount(): number {
    return this._retryCount;
  }

  get maxRetries(): number {
    return this._maxRetries;
  }

  get readAt(): Date | undefined {
    return this._readAt;
  }
}
