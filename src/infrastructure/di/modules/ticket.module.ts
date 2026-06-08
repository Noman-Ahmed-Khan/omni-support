import type { PrismaClient } from '@prisma/client';

import type { IEventBus } from '../../../application/event-bus/event-bus.interface';
import { AddCommentHandler } from '../../../application/ticket/handlers/add-comment.handler';
import { AssignTicketHandler } from '../../../application/ticket/handlers/assign-ticket.handler';
import { ChangeTicketStatusHandler } from '../../../application/ticket/handlers/change-ticket-status.handler';
import { CreateTicketHandler } from '../../../application/ticket/handlers/create-ticket.handler';
import { EscalateTicketHandler } from '../../../application/ticket/handlers/escalate-ticket.handler';
import { GetTicketHandler } from '../../../application/ticket/handlers/get-ticket.handler';
import { ListTicketsHandler } from '../../../application/ticket/handlers/list-tickets.handler';
import { TicketHistoryHandler } from '../../../application/ticket/handlers/ticket-history.handler';
import { UpdateTicketHandler } from '../../../application/ticket/handlers/update-ticket.handler';
import { TicketService } from '../../../application/ticket/services/ticket.service';
import type { ICustomerRepository } from '../../../domain/customer/repositories/customer.repository.interface';
import { CommentController } from '../../../presentation/http/controllers/comment.controller';
import { TicketController } from '../../../presentation/http/controllers/ticket.controller';
import type { DashboardCacheStrategy } from '../../cache/strategies/dashboard.cache';
import type { ActivityRepository } from '../../database/repositories/activity.repository';
import type { AuditRepository } from '../../database/repositories/audit.repository';
import { CommentRepository } from '../../database/repositories/comment.repository';
import { TicketRepository } from '../../database/repositories/ticket.repository';
import type { AIQueue } from '../../queue/queues/ai.queue';
import type { Container } from '../index';

export function registerTicketModule(container: Container): void {
  const prisma = container.resolve<PrismaClient>('prisma');
  const customerRepo = container.resolve<ICustomerRepository>('customerRepo');
  const eventBus = container.resolve<IEventBus>('eventBus');
  const aiQueue = container.resolve<AIQueue>('aiQueue');
  const activityRepo = container.resolve<ActivityRepository>('activityRepo');
  const auditRepo = container.resolve<AuditRepository>('auditRepo');
  const dashboardCache = container.resolve<DashboardCacheStrategy>('dashboardCache');

  const ticketRepo = new TicketRepository(prisma);
  container.register('ticketRepo', ticketRepo);

  const commentRepo = new CommentRepository(prisma);
  container.register('commentRepo', commentRepo);

  const ticketService = new TicketService(
    ticketRepo,
    customerRepo,
    prisma,
    eventBus,
    aiQueue,
    activityRepo,
    auditRepo,
    dashboardCache,
    commentRepo,
  );
  container.register('ticketService', ticketService);

  // Handlers
  container.register('createTicketHandler', new CreateTicketHandler(ticketService));
  container.register('updateTicketHandler', new UpdateTicketHandler(ticketService));
  container.register('assignTicketHandler', new AssignTicketHandler(ticketService));
  container.register(
    'changeTicketStatusHandler',
    new ChangeTicketStatusHandler(ticketService),
  );
  container.register('escalateTicketHandler', new EscalateTicketHandler(ticketService));
  container.register('addCommentHandler', new AddCommentHandler(ticketService));
  container.register('getTicketHandler', new GetTicketHandler(ticketService));
  container.register('listTicketsHandler', new ListTicketsHandler(ticketService));
  container.register('ticketHistoryHandler', new TicketHistoryHandler(ticketService));

  // Controllers
  container.register(
    'ticketController',
    new TicketController(
      container.resolve('createTicketHandler'),
      container.resolve('updateTicketHandler'),
      container.resolve('assignTicketHandler'),
      container.resolve('changeTicketStatusHandler'),
      container.resolve('escalateTicketHandler'),
      container.resolve('addCommentHandler'),
      container.resolve('getTicketHandler'),
      container.resolve('listTicketsHandler'),
      container.resolve('ticketHistoryHandler'),
    ),
  );

  container.register('commentController', new CommentController(ticketService));
}
