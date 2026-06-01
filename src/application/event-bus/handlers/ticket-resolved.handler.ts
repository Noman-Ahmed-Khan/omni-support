import { TicketResolvedEvent } from '../../../domain/ticket/events/ticket-resolved.event';
import { NotificationService } from '../../notification/services/notification.service';
import { logger } from '../../../shared/utils/logger.util';

export function createTicketResolvedHandler(
  notificationService: NotificationService,
) {
  return async (event: TicketResolvedEvent): Promise<void> => {
    logger.debug('Handling TicketResolvedEvent', { ticketId: event.ticketId });

    try {
      await notificationService.notifyTicketResolved(
        event.ticketId,
        event.tenantId,
      );
    } catch (error) {
      logger.error('TicketResolvedEvent handler failed', {
        eventId: event.eventId,
        error,
      });
    }
  };
}