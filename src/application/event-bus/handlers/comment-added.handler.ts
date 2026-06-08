import type { PrismaClient } from '@prisma/client';

import type { CommentAddedEvent } from '../../../domain/ticket/events/comment-added.event';
import { logger } from '../../../shared/utils/logger.util';
import type { NotificationService } from '../../notification/services/notification.service';

export function createCommentAddedHandler(
  notificationService: NotificationService,
  prisma: PrismaClient,
) {
  return async (event: CommentAddedEvent): Promise<void> => {
    logger.debug('Handling CommentAddedEvent', { ticketId: event.ticketId });

    try {
      const [ticket, author] = await Promise.all([
        prisma.ticket.findUnique({ where: { id: event.ticketId } }),
        prisma.user.findUnique({ where: { id: event.authorId } }),
      ]);

      if (!ticket || !author) return;

      await notificationService.notifyCommentAdded({
        tenantId: event.tenantId,
        ticketId: event.ticketId,
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
        authorId: event.authorId,
        authorName: `${author.firstName} ${author.lastName}`,
        commentType: event.commentType,
        customerId: ticket.customerId,
      });
    } catch (error) {
      logger.error('CommentAddedEvent handler failed', {
        eventId: event.eventId,
        error,
      });
    }
  };
}
