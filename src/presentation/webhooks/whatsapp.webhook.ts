import crypto from 'crypto';

import type { Prisma, PrismaClient } from '@prisma/client';
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';

import type { TicketService } from '../../application/ticket/services/ticket.service';
import type { IWhatsAppProvider } from '../../infrastructure/messaging/whatsapp/whatsapp-provider.interface';
import { logger } from '../../shared/utils/logger.util';
import { asyncHandler } from '../http/utils/async-handler';

export function createWhatsAppWebhook(
  whatsAppProvider: IWhatsAppProvider,
  ticketService: TicketService,
  prisma: PrismaClient,
): Router {
  const router = Router();

  const processInboundWhatsApp = async (message: { from: string; body: string }) => {
    const { from, body } = message;

    const existingTicket = await prisma.ticket.findFirst({
      where: {
        externalRef: from,
        status: { notIn: ['RESOLVED', 'CLOSED'] },
      },
      include: { customer: true },
    });

    if (existingTicket) {
      await ticketService.addComment({
        tenantId: existingTicket.tenantId,
        ticketId: existingTicket.id,
        authorId: existingTicket.customer.id,
        authorRole: 'CUSTOMER',
        content: body,
        type: 'PUBLIC',
      });
      logger.info('WhatsApp message added to existing ticket', {
        ticketId: existingTicket.id,
        from,
      });
    } else {
      const customer = await prisma.customer.findFirst({
        where: { phone: from },
      });

      if (customer) {
        await ticketService.createTicket({
          tenantId: customer.tenantId,
          customerId: customer.id,
          createdById: customer.id,
          createdByRole: 'CUSTOMER',
          title: `WhatsApp inquiry from ${from}`,
          description: body,
          source: 'whatsapp',
        });
        logger.info('New ticket created from WhatsApp', { from });
      } else {
        logger.warn('WhatsApp message from unknown number', { from });
      }
    }
  };

  router.post(
    '/inbound',
    asyncHandler(
      async (
        req: Request<ParamsDictionary, unknown, unknown, unknown>,
        res: Response,
        next: NextFunction,
      ) => {
        try {
          const signatureHeader = req.headers['x-twilio-signature'];
          const signature = Array.isArray(signatureHeader)
            ? signatureHeader[0]
            : signatureHeader;

          if (!signature) {
            res.status(400).json({ error: 'Missing signature' });
            return;
          }

          const webhookPayload = req.body;
          const rawBody = JSON.stringify(webhookPayload);

          if (!whatsAppProvider.verifyWebhook(signature, rawBody)) {
            logger.warn('WhatsApp webhook signature verification failed', { ip: req.ip });
            res.status(403).json({ error: 'Invalid signature' });
            return;
          }

          const message = whatsAppProvider.parseInboundMessage(webhookPayload);
          if (!message) {
            res.status(200).send('OK');
            return;
          }

          await prisma.webhookEvent.create({
            data: {
              id: crypto.randomUUID(),
              eventType: 'WHATSAPP_INBOUND',
              provider: 'twilio',
              payload: webhookPayload as Prisma.InputJsonValue,
              signature,
            },
          });

          void processInboundWhatsApp(message).catch((error: unknown) => {
            logger.error('Failed to process inbound WhatsApp message', { error });
          });

          res.status(200).send('OK');
        } catch (error) {
          next(error);
        }
      },
    ),
  );

  router.post(
    '/status',
    (req: Request<ParamsDictionary, unknown, unknown, unknown>, res: Response) => {
      logger.debug('WhatsApp status update', { body: req.body });
      res.status(200).send('OK');
    },
  );

  return router;
}
