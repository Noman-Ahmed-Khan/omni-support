import type { PrismaClient } from '@prisma/client';

import type { CommentAddedEvent } from '../../../domain/ticket/events/comment-added.event';
import type { TicketAssignedEvent } from '../../../domain/ticket/events/ticket-assigned.event';
import type { TicketCreatedEvent } from '../../../domain/ticket/events/ticket-created.event';
import type { TicketEscalatedEvent } from '../../../domain/ticket/events/ticket-escalated.event';
import type { TicketResolvedEvent } from '../../../domain/ticket/events/ticket-resolved.event';
import type { NotificationService } from '../../notification/services/notification.service';
import type { IEventBus } from '../event-bus.interface';

/**
 * Subscribes the notification side effects of ticket events.
 *
 * Handlers let errors propagate: the event bus reports the failure to the outbox, which
 * retries the event with backoff (handlers that already succeeded are not re-run).
 */
export function registerNotificationHandlers(
  eventBus: Pick<IEventBus, 'subscribe'>,
  notificationService: NotificationService,
  prisma: PrismaClient,
): void {
  const findTicket = (ticketId: string, tenantId: string) =>
    prisma.ticket.findFirst({ where: { id: ticketId, tenantId } });

  eventBus.subscribe<TicketCreatedEvent>('TICKET_CREATED', async (event) => {
    const ticket = await findTicket(event.ticketId, event.tenantId);
    if (!ticket) return;

    await notificationService.notifyTicketCreated({
      tenantId: event.tenantId,
      ticketId: event.ticketId,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      customerId: event.customerId,
      assignedAgentId: ticket.assignedAgentId ?? undefined,
    });
  });

  eventBus.subscribe<TicketAssignedEvent>('TICKET_ASSIGNED', async (event) => {
    const ticket = await findTicket(event.ticketId, event.tenantId);
    if (!ticket) return;

    await notificationService.notifyTicketAssigned({
      tenantId: event.tenantId,
      ticketId: event.ticketId,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      agentId: event.agentId,
      assignedById: event.assignedById,
    });
  });

  eventBus.subscribe<TicketEscalatedEvent>('TICKET_ESCALATED', async (event) => {
    const ticket = await findTicket(event.ticketId, event.tenantId);
    if (!ticket) return;

    await notificationService.notifyTicketEscalated({
      tenantId: event.tenantId,
      ticketId: event.ticketId,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      reason: event.reason,
      assignedAgentId: event.assignedAgentId,
    });
  });

  eventBus.subscribe<TicketResolvedEvent>('TICKET_RESOLVED', async (event) => {
    await notificationService.notifyTicketResolved(event.ticketId, event.tenantId);
  });

  eventBus.subscribe<CommentAddedEvent>('COMMENT_ADDED', async (event) => {
    const [ticket, author] = await Promise.all([
      findTicket(event.ticketId, event.tenantId),
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
  });
}
