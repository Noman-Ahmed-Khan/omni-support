import crypto from 'crypto';

import type { Prisma, PrismaClient, WebhookEventType } from '@prisma/client';
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';

import type { WebhookProcessingService } from '../../application/messaging/services/webhook-processing.service';
import type { IWhatsAppProvider } from '../../infrastructure/messaging/whatsapp/whatsapp-provider.interface';
import { logger } from '../../shared/utils/logger.util';
import { asyncHandler } from '../http/utils/async-handler';

/**
 * Twilio WhatsApp webhooks. Every request must carry a valid X-Twilio-Signature;
 * events are stored first and then processed by WebhookProcessingService.
 */
export function createWhatsAppWebhook(
  whatsAppProvider: IWhatsAppProvider,
  processing: WebhookProcessingService,
  prisma: PrismaClient,
): Router {
  const router = Router();

  const verifySignature =
    (path: string) =>
    (req: Request, res: Response, next: NextFunction): void => {
      const header = req.headers['x-twilio-signature'];
      const signature = Array.isArray(header) ? header[0] : header;
      const params = (req.body ?? {}) as Record<string, unknown>;

      if (!signature || !whatsAppProvider.verifyWebhook(signature, path, params)) {
        logger.warn('WhatsApp webhook signature verification failed', {
          path,
          ip: req.ip,
        });
        res.status(403).json({ error: 'Invalid signature' });
        return;
      }

      next();
    };

  const recordEvent = (
    eventType: WebhookEventType,
    payload: unknown,
    signature: string,
  ): Promise<{ id: string }> =>
    prisma.webhookEvent.create({
      data: {
        id: crypto.randomUUID(),
        eventType,
        provider: 'twilio',
        payload: payload as Prisma.InputJsonValue,
        signature,
      },
      select: { id: true },
    });

  router.post(
    '/inbound',
    verifySignature('/inbound'),
    asyncHandler(async (req: Request, res: Response) => {
      const message = whatsAppProvider.parseInboundMessage(req.body);
      if (!message) {
        res.status(200).send('OK');
        return;
      }

      const event = await recordEvent(
        'WHATSAPP_INBOUND',
        req.body,
        String(req.headers['x-twilio-signature']),
      );

      // Acknowledge immediately; Twilio retries slow webhooks.
      res.status(200).send('OK');

      void processing
        .process(event.id)
        .then((outcome) => {
          if (outcome.status !== 'PROCESSED') {
            logger.warn('Inbound WhatsApp message not processed', {
              eventId: event.id,
              status: outcome.status,
            });
          }
        })
        .catch((error: unknown) => {
          logger.error('Failed to process inbound WhatsApp message', { error });
        });
    }),
  );

  router.post(
    '/status',
    verifySignature('/status'),
    asyncHandler(async (req: Request, res: Response) => {
      await recordEvent(
        'WHATSAPP_STATUS',
        req.body,
        String(req.headers['x-twilio-signature']),
      );
      res.status(200).send('OK');
    }),
  );

  return router;
}
