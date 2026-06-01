import { TicketAssignedEvent } from '../../../domain/ticket/events/ticket-assigned.event';
import { NotificationService } from '../../notification/services/notification.service';
import { PrismaClient } from '@prisma/client';
import { logger } from '../../../shared/utils/logger.util';

export function createTicketAssignedHandler(
  notificationService: NotificationService,
  prisma: PrismaClient,
) {
  return async (event: TicketAssignedEvent): Promise<void> => {
    logger.debug('Handling TicketAssignedEvent', { ticketId: event.ticketId });

    try {
      const ticket = await prisma.ticket.findUnique({
        where: { id: event.ticketId },
      });

      if (!ticket) return;

      await notificationService.notifyTicketAssigned({
        tenantId: event.tenantId,
        ticketId: event.ticketId,
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
        agentId: event.agentId,
        assignedById: event.assignedById,
      });
    } catch (error) {
      logger.error('TicketAssignedEvent handler failed', {
        eventId: event.eventId,
        error,
      });
    }
  };
}