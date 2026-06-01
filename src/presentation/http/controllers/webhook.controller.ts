import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { IWhatsAppProvider } from '../../../infrastructure/messaging/whatsapp/whatsapp-provider.interface';
import { TicketService } from '../../../application/ticket/services/ticket.service';
import { logger } from '../../../shared/utils/logger.util';
import crypto from 'crypto';

export class WebhookController {
  constructor(
    private readonly whatsAppProvider: IWhatsAppProvider,
    private readonly ticketService: TicketService,
    private readonly prisma: PrismaClient,
  ) {}

  async handleWhatsAppInbound(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      // Verify webhook signature
      const signature = req.headers['x-twilio-signature'] as string;
      const rawBody = JSON.stringify(req.body);

      if (!this.whatsAppProvider.verifyWebhook(signature, rawBody)) {
        logger.warn('WhatsApp webhook signature verification failed', {
          ip: req.ip,
        });
        res.status(403).json({ error: 'Invalid signature' });
        return;
      }

      const message = this.whatsAppProvider.parseInboundMessage(req.body);

      if (!message) {
        res.status(200).send('OK');
        return;
      }

      // Log webhook event
      await this.prisma.webhookEvent.create({
        data: {
          id: crypto.randomUUID(),
          eventType: 'WHATSAPP_INBOUND',
          provider: 'twilio',
          payload: req.body as any,
          signature,
        },
      });

      // Process inbound message asynchronously
      this.processInboundWhatsApp(message).catch((error) => {
        logger.error('Failed to process inbound WhatsApp message', { error });
      });

      // Respond to Twilio immediately
      res.status(200).send('OK');
    } catch (error) {
      next(error);
    }
  }

  private async processInboundWhatsApp(message: any): Promise<void> {
    const { from, body } = message;

    // Try to find existing ticket by phone/external ref
    const existingTicket = await this.prisma.ticket.findFirst({
      where: {
        externalRef: from,
        status: { notIn: ['RESOLVED', 'CLOSED'] },
      },
      include: { customer: true },
    });

    if (existingTicket) {
      // Add comment to existing ticket
      await this.ticketService.addComment({
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
      // Try to find customer by phone
      const customer = await this.prisma.customer.findFirst({
        where: { phone: from },
      });

      if (customer) {
        // Create new ticket from WhatsApp message
        await this.ticketService.createTicket({
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
  }

  async handleWhatsAppStatus(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    // Handle delivery status updates
    logger.debug('WhatsApp status update', { body: req.body });
    res.status(200).send('OK');
  }
}
