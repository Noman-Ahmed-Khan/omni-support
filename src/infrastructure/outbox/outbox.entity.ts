export enum OutboxStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
  DEAD_LETTER = 'DEAD_LETTER',
}

export interface OutboxPayload {
  eventId: string;
  eventType: string;
  occurredAt: Date;
  tenantId?: string;
  aggregateId?: string;
  aggregateType?: string;
  payload: Record<string, unknown>;
}

export interface OutboxRecord extends OutboxPayload {
  id: string;
  status: OutboxStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: Date;
  processedAt?: Date | null;
  failedAt?: Date | null;
  deadLetterReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
