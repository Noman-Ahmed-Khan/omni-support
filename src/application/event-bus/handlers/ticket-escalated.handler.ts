import { TicketEscalatedEvent } from '../../../domain/ticket/events/ticket-escalated.event';
import { NotificationService } from '../../notification/services/notification.service';
import { PrismaClient } from '@prisma/client';
import { logger } from '../../../shared/utils/logger.util';

export function createTicketEscalatedHandler(
  notificationService: NotificationService,
  prisma: PrismaClient,
) {
  return async (event: TicketEscalatedEvent): Promise<void> => {
    logger.debug('Handling TicketEscalatedEvent', {
      ticketId: event.ticketId,
    });

    try {
      const ticket = await prisma.ticket.findUnique({
        where: { id: event.ticketId },
      });

      if (!ticket) return;

      await notificationService.notifyTicketEscalated({
        tenantId: event.tenantId,
        ticketId: event.ticketId,
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
        reason: event.reason,
        assignedAgentId: event.assignedAgentId,
      });
    } catch (error) {
      logger.error('TicketEscalatedEvent handler failed', {
        eventId: event.eventId,
        error,
      });
    }
  };
}
