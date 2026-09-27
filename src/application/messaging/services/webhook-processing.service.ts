import { randomUUID } from 'crypto';

import type { PrismaClient } from '@prisma/client';

import type { IWhatsAppProvider } from '../../../infrastructure/messaging/whatsapp/whatsapp-provider.interface';
import { logger } from '../../../shared/utils/logger.util';
import type { ProcessInboundWhatsAppHandler } from '../handlers/process-inbound-whatsapp.handler';

/**
 * Webhook event states. PROCESSED and CANCELLED are terminal; SKIPPED (no matching
 * tenant/customer) and FAILED may be retried by an operator.
 */
export const WebhookStatus = {
  RECEIVED: 'RECEIVED',
  PROCESSING: 'PROCESSING',
  PROCESSED: 'PROCESSED',
  SKIPPED: 'SKIPPED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export const RETRYABLE_WEBHOOK_STATUSES: string[] = [
  WebhookStatus.RECEIVED,
  WebhookStatus.SKIPPED,
  WebhookStatus.FAILED,
];

const LEASE_MS = 5 * 60 * 1000;

export type WebhookProcessingOutcome =
  | { status: 'PROCESSED' | 'SKIPPED' | 'FAILED'; detail?: string }
  | { status: 'NOT_CLAIMED' };

export class WebhookProcessingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly whatsAppProvider: IWhatsAppProvider,
    private readonly inboundHandler: ProcessInboundWhatsAppHandler,
  ) {}

  /**
   * Processes one stored event. The conditional claim (status + lease) guarantees that
   * concurrent workers or operators never process the same row at the same time.
   */
  async process(eventId: string): Promise<WebhookProcessingOutcome> {
    const workerId = randomUUID();
    const staleBefore = new Date(Date.now() - LEASE_MS);
    const claimed = await this.prisma.webhookEvent.updateMany({
      where: {
        id: eventId,
        eventType: 'WHATSAPP_INBOUND',
        OR: [
          { status: { in: RETRYABLE_WEBHOOK_STATUSES } },
          { status: WebhookStatus.PROCESSING, lockedAt: { lt: staleBefore } },
        ],
      },
      data: {
        status: WebhookStatus.PROCESSING,
        lockedAt: new Date(),
        lockedBy: workerId,
      },
    });
    if (claimed.count !== 1) return { status: 'NOT_CLAIMED' };

    const event = await this.prisma.webhookEvent.findUniqueOrThrow({
      where: { id: eventId },
    });
    let outcome: { status: 'PROCESSED' | 'SKIPPED' | 'FAILED'; detail?: string };
    try {
      const message = this.whatsAppProvider.parseInboundMessage(event.payload);
      if (!message) {
        outcome = { status: 'SKIPPED', detail: 'Payload is not an inbound message' };
      } else {
        const result = await this.inboundHandler.execute(message);
        outcome =
          result.status === 'skipped'
            ? { status: 'SKIPPED', detail: result.reason }
            : { status: 'PROCESSED' };
      }
    } catch (error) {
      logger.error('Failed to process inbound WhatsApp message', { eventId, error });
      outcome = {
        status: 'FAILED',
        detail: error instanceof Error ? error.message : String(error),
      };
    }

    await this.prisma.webhookEvent.updateMany({
      where: { id: eventId, lockedBy: workerId },
      data: {
        status: outcome.status,
        processed: outcome.status === 'PROCESSED',
        processedAt: new Date(),
        error: outcome.detail?.slice(0, 2000) ?? null,
        lockedAt: null,
        lockedBy: null,
        ...(outcome.status === 'FAILED' ? { retryCount: { increment: 1 } } : {}),
      },
    });
    return outcome;
  }
}
