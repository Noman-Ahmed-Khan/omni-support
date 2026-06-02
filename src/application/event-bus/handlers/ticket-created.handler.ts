import { TicketCreatedEvent } from '../../../domain/ticket/events/ticket-created.event';
import { NotificationService } from '../../notification/services/notification.service';
import { PrismaClient } from '@prisma/client';
import { logger } from '../../../shared/utils/logger.util';

export function createTicketCreatedHandler(
  notificationService: NotificationService,
  prisma: PrismaClient,
) {
  return async (event: TicketCreatedEvent): Promise<void> => {
    logger.debug('Handling TicketCreatedEvent', { ticketId: event.ticketId });

    try {
      const ticket = await prisma.ticket.findUnique({
        where: { id: event.ticketId },
      });

      if (!ticket) return;

      await notificationService.notifyTicketCreated({
        tenantId: event.tenantId,
        ticketId: event.ticketId,
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
        customerId: event.customerId,
        assignedAgentId: ticket.assignedAgentId ?? undefined,
      });
    } catch (error) {
      logger.error('TicketCreatedEvent handler failed', {
        eventId: event.eventId,
        ticketId: event.ticketId,
        error,
      });
    }
  };
}
