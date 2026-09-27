import type { PrismaClient } from '@prisma/client';

import type { WhatsAppWebhookPayload } from '../../../infrastructure/messaging/whatsapp/whatsapp-provider.interface';
import { logger } from '../../../shared/utils/logger.util';
import type { TicketService } from '../../ticket/services/ticket.service';

export type InboundWhatsAppOutcome =
  | { status: 'commented'; ticketId: string }
  | { status: 'ticket-created'; ticketId: string }
  | { status: 'skipped'; reason: string };

/** Only digits and a leading "+" are compared, so formatting differences do not matter. */
function normalizePhone(value: string): string {
  const trimmed = value.trim();
  return (trimmed.startsWith('+') ? '+' : '') + trimmed.replace(/\D/g, '');
}

/**
 * Turns an inbound WhatsApp message into a ticket comment or a new ticket.
 *
 * The organization is identified by the business number the customer wrote to (the
 * `phoneNumber` of the tenant's enabled "whatsapp" integration). Every lookup is scoped
 * to that organization. Comments and tickets must be attributed to a user, so the
 * customer needs a linked portal account (customer_links); otherwise the message is kept
 * in webhook_events for manual follow-up.
 */
export class ProcessInboundWhatsAppHandler {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ticketService: TicketService,
  ) {}

  async execute(message: WhatsAppWebhookPayload): Promise<InboundWhatsAppOutcome> {
    const tenantId = await this.resolveTenantId(message.to);
    if (!tenantId) {
      return { status: 'skipped', reason: 'No organization uses this WhatsApp number' };
    }

    const from = normalizePhone(message.from);

    const customer = await this.prisma.customer.findFirst({
      where: { tenantId, phone: from },
    });
    if (!customer) {
      return { status: 'skipped', reason: 'Unknown sender' };
    }

    // Only a portal account linked to this customer record (via an accepted invitation)
    // may author on the customer's behalf; matching by email alone is not enough.
    const link = await this.prisma.customerLink.findFirst({
      where: { tenantId, customerId: customer.id, user: { status: 'ACTIVE' } },
      select: { userId: true },
    });
    if (!link) {
      return { status: 'skipped', reason: 'Customer has no linked user account' };
    }
    const author = { id: link.userId };

    const openTicket = await this.prisma.ticket.findFirst({
      where: {
        tenantId,
        customerId: customer.id,
        externalRef: from,
        status: { notIn: ['RESOLVED', 'CLOSED'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (openTicket) {
      await this.ticketService.addComment({
        tenantId,
        ticketId: openTicket.id,
        authorId: author.id,
        authorRole: 'CUSTOMER',
        content: message.body,
        type: 'PUBLIC',
      });
      return { status: 'commented', ticketId: openTicket.id };
    }

    const ticket = await this.ticketService.createTicket({
      tenantId,
      customerId: customer.id,
      createdById: author.id,
      createdByRole: 'CUSTOMER',
      title: `WhatsApp message from ${customer.fullName}`,
      description: message.body,
      source: 'whatsapp',
    });

    // Later messages from the same number are threaded onto this ticket.
    await this.prisma.ticket.updateMany({
      where: { id: ticket.id, tenantId },
      data: { externalRef: from },
    });

    logger.info('Ticket created from WhatsApp message', {
      tenantId,
      ticketId: ticket.id,
    });
    return { status: 'ticket-created', ticketId: ticket.id };
  }

  private async resolveTenantId(businessNumber: string): Promise<string | null> {
    const integrations = await this.prisma.tenantIntegration.findMany({
      where: { provider: 'whatsapp', isEnabled: true },
      select: { tenantId: true, config: true },
    });

    const target = normalizePhone(businessNumber);
    const matches = integrations.filter((integration) => {
      const phone = (integration.config as { phoneNumber?: unknown } | null)?.phoneNumber;
      return typeof phone === 'string' && normalizePhone(phone) === target;
    });

    // A number shared by several organizations cannot be routed safely.
    return matches.length === 1 ? matches[0].tenantId : null;
  }
}
