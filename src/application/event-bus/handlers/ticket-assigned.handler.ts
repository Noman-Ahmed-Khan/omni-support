import type { PrismaClient } from '@prisma/client';

import type { TicketAssignedEvent } from '../../../domain/ticket/events/ticket-assigned.event';
import { logger } from '../../../shared/utils/logger.util';
import type { NotificationService } from '../../notification/services/notification.service';

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
