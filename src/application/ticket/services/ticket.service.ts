import crypto from 'crypto';
import {
  ITicketRepository,
  TicketFilters,
  PaginationOptions,
  PaginatedResult,
} from '../../../domain/ticket/repositories/ticket.repository.interface';
import { ICustomerRepository } from '../../../domain/customer/repositories/customer.repository.interface';
import { TicketEntity } from '../../../domain/ticket/entities/ticket.entity';
import { TicketStatus } from '../../../domain/ticket/value-objects/ticket-status.vo';
import { TicketPriority } from '../../../domain/ticket/value-objects/ticket-priority.vo';
import { IEventBus } from '../../event-bus/event-bus.interface';
import { AIQueue } from '../../../infrastructure/queue/queues/ai.queue';
import { ActivityRepository } from '../../../infrastructure/database/repositories/activity.repository';
import { AuditRepository } from '../../../infrastructure/database/repositories/audit.repository';
import { DashboardCacheStrategy } from '../../../infrastructure/cache/strategies/dashboard.cache';
import {
  NotFoundError,
  DomainError,
} from '../../../shared/errors/domain.error';
import { ForbiddenError } from '../../../shared/errors/application.error';
import { logger } from '../../../shared/utils/logger.util';
import { PrismaClient } from '@prisma/client';

export interface CreateTicketDto {
  tenantId: string;
  customerId: string;
  createdById: string;
  createdByRole: string;
  title: string;
  description: string;
  priority?: string;
  category?: string;
  tags?: string[];
  source?: string;
  dueAt?: Date;
  assignedAgentId?: string;
}

export interface UpdateTicketDto {
  tenantId: string;
  ticketId: string;
  updatedById: string;
  updatedByRole: string;
  title?: string;
  description?: string;
  priority?: string;
  category?: string;
  tags?: string[];
  dueAt?: Date;
}

export interface AssignTicketDto {
  tenantId: string;
  ticketId: string;
  agentId: string;
  assignedById: string;
  assignedByRole: string;
}

export interface ChangeStatusDto {
  tenantId: string;
  ticketId: string;
  newStatus: string;
  changedById: string;
  changedByRole: string;
}

export interface EscalateTicketDto {
  tenantId: string;
  ticketId: string;
  reason: string;
  escalatedById: string;
  escalatedByRole: string;
}

export interface AddCommentDto {
  tenantId: string;
  ticketId: string;
  authorId: string;
  authorRole: string;
  content: string;
  type: 'PUBLIC' | 'INTERNAL';
}

export class TicketService {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly customerRepo: ICustomerRepository,
    private readonly prisma: PrismaClient,
    private readonly eventBus: IEventBus,
    private readonly aiQueue: AIQueue,
    private readonly activityRepo: ActivityRepository,
    private readonly auditRepo: AuditRepository,
    private readonly dashboardCache: DashboardCacheStrategy,
  ) {}

  async createTicket(dto: CreateTicketDto): Promise<TicketEntity> {
    // Validate customer exists and belongs to tenant
    const customer = await this.customerRepo.findById(
      dto.customerId,
      dto.tenantId,
    );

    if (!customer) {
      throw new NotFoundError('Customer', dto.customerId);
    }

    if (customer.isBlocked()) {
      throw new ForbiddenError('Cannot create ticket for blocked customer');
    }

    // Get next ticket number (atomic)
    const ticketNumber = await this.ticketRepo.getNextTicketNumber(
      dto.tenantId,
    );

    const ticketId = crypto.randomUUID();

    const ticket = TicketEntity.create(ticketId, {
      tenantId: dto.tenantId,
      ticketNumber,
      customerId: dto.customerId,
      assignedAgentId: dto.assignedAgentId,
      createdById: dto.createdById,
      title: dto.title,
      description: dto.description,
      status: TicketStatus.open(),
      priority: TicketPriority.create(dto.priority ?? 'MEDIUM'),
      category: dto.category ?? 'GENERAL',
      tags: dto.tags ?? [],
      source: dto.source ?? 'web',
      isEscalated: false,
      slaBreached: false,
      dueAt: dto.dueAt,
      metadata: {},
    });

    // Save ticket
    const saved = await this.ticketRepo.save(ticket);

    // Update customer last activity
    customer.recordActivity();
    await this.customerRepo.update(customer);

    // Log activity
    await this.activityRepo.create({
      tenantId: dto.tenantId,
      ticketId: saved.id,
      customerId: dto.customerId,
      actorId: dto.createdById,
      actorRole: dto.createdByRole,
      eventType: 'TICKET_CREATED',
      description: `Ticket #${ticketNumber} created: ${dto.title}`,
      newValue: { ticketId: saved.id, ticketNumber, title: dto.title },
    });

    // Audit log
    await this.auditRepo.create({
      tenantId: dto.tenantId,
      actorId: dto.createdById,
      actorRole: dto.createdByRole,
      action: 'CREATE',
      resource: 'tickets',
      resourceId: saved.id,
      newValue: { ticketNumber, title: dto.title, status: 'OPEN' },
    });

    // Queue AI analysis (async - does not block response)
    await this.aiQueue.addTicketAnalysis(
      saved.id,
      dto.tenantId,
      `${dto.title}\n\n${dto.description}`,
    );

    // Publish domain events
    const events = saved.pullDomainEvents();
    await this.eventBus.publishAll(events);

    // Invalidate dashboard cache
    await this.dashboardCache.invalidate(dto.tenantId);

    logger.info('Ticket created', {
      ticketId: saved.id,
      ticketNumber,
      tenantId: dto.tenantId,
    });

    return saved;
  }

  async updateTicket(dto: UpdateTicketDto): Promise<TicketEntity> {
    const ticket = await this.getTicketOrThrow(dto.ticketId, dto.tenantId);

    if (!ticket.isActive()) {
      throw new DomainError('Cannot update a closed or resolved ticket');
    }

    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};

    if (dto.priority && dto.priority !== ticket.priority) {
      oldValues.priority = ticket.priority;
      newValues.priority = dto.priority;
      ticket.updatePriority(TicketPriority.create(dto.priority));
    }

    if (dto.category && dto.category !== ticket.category) {
      oldValues.category = ticket.category;
      newValues.category = dto.category;
      ticket.updateCategory(dto.category);
    }

    const updated = await this.ticketRepo.update(ticket);

    if (Object.keys(newValues).length > 0) {
      await this.activityRepo.create({
        tenantId: dto.tenantId,
        ticketId: dto.ticketId,
        actorId: dto.updatedById,
        actorRole: dto.updatedByRole,
        eventType: 'TICKET_PRIORITY_CHANGED',
        description: `Ticket updated`,
        oldValue: oldValues,
        newValue: newValues,
      });

      await this.auditRepo.create({
        tenantId: dto.tenantId,
        actorId: dto.updatedById,
        actorRole: dto.updatedByRole,
        action: 'UPDATE',
        resource: 'tickets',
        resourceId: dto.ticketId,
        oldValue: oldValues,
        newValue: newValues,
      });
    }

    await this.dashboardCache.invalidate(dto.tenantId);

    return updated;
  }

  async assignTicket(dto: AssignTicketDto): Promise<TicketEntity> {
    const ticket = await this.getTicketOrThrow(dto.ticketId, dto.tenantId);

    // Validate agent exists in tenant
    const agent = await this.prisma.user.findFirst({
      where: {
        id: dto.agentId,
        tenantId: dto.tenantId,
        role: { in: ['AGENT', 'TENANT_MANAGER'] },
        status: 'ACTIVE',
      },
    });

    if (!agent) {
      throw new NotFoundError('Agent', dto.agentId);
    }

    const previousAgentId = ticket.assignedAgentId;
    ticket.assign(dto.agentId, dto.assignedById);

    const updated = await this.ticketRepo.update(ticket);

    await this.activityRepo.create({
      tenantId: dto.tenantId,
      ticketId: dto.ticketId,
      actorId: dto.assignedById,
      actorRole: dto.assignedByRole,
      eventType: previousAgentId ? 'TICKET_REASSIGNED' : 'TICKET_ASSIGNED',
      description: `Ticket assigned to ${agent.firstName} ${agent.lastName}`,
      oldValue: previousAgentId ? { agentId: previousAgentId } : undefined,
      newValue: { agentId: dto.agentId },
    });

    await this.auditRepo.create({
      tenantId: dto.tenantId,
      actorId: dto.assignedById,
      actorRole: dto.assignedByRole,
      action: 'ASSIGN',
      resource: 'tickets',
      resourceId: dto.ticketId,
      newValue: { agentId: dto.agentId },
    });

    const events = updated.pullDomainEvents();
    await this.eventBus.publishAll(events);
    await this.dashboardCache.invalidate(dto.tenantId);

    return updated;
  }

  async changeStatus(dto: ChangeStatusDto): Promise<TicketEntity> {
    const ticket = await this.getTicketOrThrow(dto.ticketId, dto.tenantId);

    const oldStatus = ticket.status;
    const newStatus = TicketStatus.create(dto.newStatus);

    ticket.changeStatus(newStatus, dto.changedById);

    const updated = await this.ticketRepo.update(ticket);

    await this.activityRepo.create({
      tenantId: dto.tenantId,
      ticketId: dto.ticketId,
      actorId: dto.changedById,
      actorRole: dto.changedByRole,
      eventType: 'TICKET_STATUS_CHANGED',
      description: `Status changed from ${oldStatus} to ${dto.newStatus}`,
      oldValue: { status: oldStatus },
      newValue: { status: dto.newStatus },
    });

    await this.auditRepo.create({
      tenantId: dto.tenantId,
      actorId: dto.changedById,
      actorRole: dto.changedByRole,
      action: 'UPDATE',
      resource: 'tickets',
      resourceId: dto.ticketId,
      oldValue: { status: oldStatus },
      newValue: { status: dto.newStatus },
    });

    const events = updated.pullDomainEvents();
    await this.eventBus.publishAll(events);
    await this.dashboardCache.invalidate(dto.tenantId);

    // Queue AI summary on resolution
    if (newStatus.isResolved()) {
      await this.aiQueue.add({
        jobType: 'summarize',
        tenantId: dto.tenantId,
        ticketId: dto.ticketId,
        content: `${ticket.title}\n\n${ticket.description}`,
      });
    }

    return updated;
  }

  async escalateTicket(dto: EscalateTicketDto): Promise<TicketEntity> {
    const ticket = await this.getTicketOrThrow(dto.ticketId, dto.tenantId);

    ticket.escalate(dto.reason, dto.escalatedById);

    const updated = await this.ticketRepo.update(ticket);

    await this.activityRepo.create({
      tenantId: dto.tenantId,
      ticketId: dto.ticketId,
      actorId: dto.escalatedById,
      actorRole: dto.escalatedByRole,
      eventType: 'TICKET_ESCALATED',
      description: `Ticket escalated: ${dto.reason}`,
      newValue: { reason: dto.reason, escalatedAt: new Date() },
    });

    await this.auditRepo.create({
      tenantId: dto.tenantId,
      actorId: dto.escalatedById,
      actorRole: dto.escalatedByRole,
      action: 'ESCALATE',
      resource: 'tickets',
      resourceId: dto.ticketId,
      newValue: { reason: dto.reason },
    });

    const events = updated.pullDomainEvents();
    await this.eventBus.publishAll(events);
    await this.dashboardCache.invalidate(dto.tenantId);

    logger.info('Ticket escalated', {
      ticketId: dto.ticketId,
      tenantId: dto.tenantId,
      reason: dto.reason,
    });

    return updated;
  }

  async addComment(
    dto: AddCommentDto,
  ): Promise<import('@prisma/client').TicketComment & {
    author: {
      id: string;
      firstName: string;
      lastName: string;
      role: string;
      avatarUrl: string | null;
    };
  }> {
    const ticket = await this.getTicketOrThrow(dto.ticketId, dto.tenantId);

    // Validate author exists
    const author = await this.prisma.user.findUnique({
      where: { id: dto.authorId },
    });

    if (!author) {
      throw new NotFoundError('User', dto.authorId);
    }

    // Customers cannot add internal notes
    if (dto.authorRole === 'CUSTOMER' && dto.type === 'INTERNAL') {
      throw new ForbiddenError('Customers cannot add internal notes');
    }

    const commentId = crypto.randomUUID();

    const comment = await this.prisma.ticketComment.create({
      data: {
        id: commentId,
        tenantId: dto.tenantId,
        ticketId: dto.ticketId,
        authorId: dto.authorId,
        content: dto.content,
        type: dto.type,
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Update ticket status if customer replies to pending ticket
    if (
      dto.authorRole === 'CUSTOMER' &&
      ticket.status === 'PENDING_CUSTOMER'
    ) {
      ticket.changeStatus(TicketStatus.create('IN_PROGRESS'), dto.authorId);
      await this.ticketRepo.update(ticket);
    }

    await this.activityRepo.create({
      tenantId: dto.tenantId,
      ticketId: dto.ticketId,
      actorId: dto.authorId,
      actorRole: dto.authorRole,
      eventType: 'COMMENT_ADDED',
      description: `${dto.type === 'INTERNAL' ? 'Internal note' : 'Comment'} added by ${author.firstName}`,
      newValue: { commentId, type: dto.type },
    });

    // Queue AI sentiment analysis for public comments
    if (dto.type === 'PUBLIC') {
      await this.aiQueue.add({
        jobType: 'sentiment',
        tenantId: dto.tenantId,
        ticketId: dto.ticketId,
        content: dto.content,
        metadata: { commentId, authorRole: dto.authorRole },
      });
    }

    const events = ticket.pullDomainEvents();
    await this.eventBus.publishAll(events);

    logger.info('Comment added', {
      commentId,
      ticketId: dto.ticketId,
      tenantId: dto.tenantId,
      type: dto.type,
    });

    return comment;
  }

  async getTicket(id: string, tenantId: string): Promise<TicketEntity> {
    return this.getTicketOrThrow(id, tenantId);
  }

  async listTickets(
    filters: TicketFilters,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<TicketEntity>> {
    return this.ticketRepo.findAll(filters, pagination);
  }

  async getTicketHistory(
    ticketId: string,
    tenantId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{
    data: import('@prisma/client').ActivityLog[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    // Verify ticket belongs to tenant
    await this.getTicketOrThrow(ticketId, tenantId);

    return this.activityRepo.findByTicket(ticketId, tenantId, page, limit);
  }

  private async getTicketOrThrow(
    id: string,
    tenantId: string,
  ): Promise<TicketEntity> {
    const ticket = await this.ticketRepo.findById(id, tenantId);

    if (!ticket) {
      throw new NotFoundError('Ticket', id);
    }

    return ticket;
  }
}
