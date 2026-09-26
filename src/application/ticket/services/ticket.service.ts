import crypto from 'crypto';

import type { ActivityLog, PrismaClient, TicketComment } from '@prisma/client';

import type { ICustomerRepository } from '../../../domain/customer/repositories/customer.repository.interface';
import { SlaPolicy } from '../../../domain/policies/sla.policy';
import { TenantLimitsPolicy } from '../../../domain/policies/tenant-limits.policy';
import { TicketAssignmentPolicy } from '../../../domain/policies/ticket-assignment.policy';
import { TicketEscalationPolicy } from '../../../domain/policies/ticket-escalation.policy';
import { TicketCommentEntity } from '../../../domain/ticket/entities/ticket-comment.entity';
import { TicketEntity } from '../../../domain/ticket/entities/ticket.entity';
import type { ICommentRepository } from '../../../domain/ticket/repositories/comment.repository.interface';
import type {
  ITicketRepository,
  TicketFilters,
  PaginationOptions,
  PaginatedResult,
} from '../../../domain/ticket/repositories/ticket.repository.interface';
import { TicketPriority } from '../../../domain/ticket/value-objects/ticket-priority.vo';
import { TicketStatus } from '../../../domain/ticket/value-objects/ticket-status.vo';
import type { DashboardCacheStrategy } from '../../../infrastructure/cache/strategies/dashboard.cache';
import { mapPrismaTenantToEntity } from '../../../infrastructure/database/mappers/tenant.mapper';
import type { ActivityRepository } from '../../../infrastructure/database/repositories/activity.repository';
import type { AuditRepository } from '../../../infrastructure/database/repositories/audit.repository';
import { TransactionManager } from '../../../infrastructure/database/transaction-manager';
import type { AIQueue } from '../../../infrastructure/queue/queues/ai.queue';
import { ForbiddenError } from '../../../shared/errors/application.error';
import { NotFoundError, DomainError } from '../../../shared/errors/domain.error';
import { startOfUtcDay } from '../../../shared/utils/date.util';
import { logger } from '../../../shared/utils/logger.util';
import { SYSTEM_ACTOR_ID, toActorUserId } from '../../../shared/utils/system-actor.util';
import type { IEventBus } from '../../event-bus/event-bus.interface';

export { SYSTEM_ACTOR_ID };

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

export interface EditCommentDto {
  tenantId: string;
  commentId: string;
  authorId: string;
  authorRole?: string;
  content: string;
}

export interface DeleteCommentDto {
  tenantId: string;
  commentId: string;
  authorId: string;
  authorRole: string;
}

type TicketCommentWithAuthor = TicketComment & {
  author: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
    avatarUrl: string | null;
  };
};

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
    private readonly commentRepo: ICommentRepository,
    private readonly transactionManager: Pick<
      TransactionManager,
      'run'
    > = new TransactionManager(prisma),
  ) {}

  /**
   * Runs aggregate writes, activity/audit records and outbox inserts atomically.
   * Calls to external systems (queues, cache) belong after the transaction commits.
   */
  private inTransaction<T>(work: () => Promise<T>): Promise<T> {
    return this.transactionManager.run(() => work());
  }

  async createTicket(dto: CreateTicketDto): Promise<TicketEntity> {
    // Validate customer exists and belongs to tenant
    const customer = await this.customerRepo.findById(dto.customerId, dto.tenantId);

    if (!customer) {
      throw new NotFoundError('Customer', dto.customerId);
    }

    if (customer.isBlocked()) {
      throw new ForbiddenError('Cannot create ticket for blocked customer');
    }

    const tenantRecord = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
    });

    if (!tenantRecord) {
      throw new NotFoundError('Tenant', dto.tenantId);
    }

    const tenant = mapPrismaTenantToEntity(tenantRecord);
    const tenantLimitsPolicy = new TenantLimitsPolicy();

    if (dto.assignedAgentId) {
      await this.findAssignableAgentOrThrow(dto.assignedAgentId, dto.tenantId);
    }

    const { saved, ticketNumber } = await this.inTransaction(async () => {
      // Taking the next number locks the tenant's sequence row until commit, so concurrent
      // creates are serialized and the daily limit below is checked against committed rows.
      const ticketNumber = await this.ticketRepo.getNextTicketNumber(dto.tenantId);

      const ticketsCreatedToday = await this.ticketRepo.countCreatedSince(
        dto.tenantId,
        startOfUtcDay(new Date()),
      );

      if (!tenantLimitsPolicy.canCreateTicket(tenant, ticketsCreatedToday)) {
        throw new ForbiddenError('Tenant ticket limit has been reached');
      }

      const priority = TicketPriority.create(dto.priority ?? 'MEDIUM');

      const ticket = TicketEntity.create(crypto.randomUUID(), {
        tenantId: dto.tenantId,
        ticketNumber,
        customerId: dto.customerId,
        assignedAgentId: dto.assignedAgentId,
        createdById: dto.createdById,
        title: dto.title,
        description: dto.description,
        status: TicketStatus.open(),
        priority,
        category: dto.category ?? 'GENERAL',
        tags: dto.tags ?? [],
        source: dto.source ?? 'web',
        isEscalated: false,
        slaBreached: false,
        // Every ticket gets an SLA deadline; an explicit due date takes precedence.
        dueAt:
          dto.dueAt ??
          new SlaPolicy().computeDueAt(priority.toString(), new Date(), tenant),
        metadata: {},
      });

      const saved = await this.ticketRepo.save(ticket);

      customer.recordActivity();
      await this.customerRepo.update(customer);

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

      await this.auditRepo.create({
        tenantId: dto.tenantId,
        actorId: dto.createdById,
        actorRole: dto.createdByRole,
        action: 'CREATE',
        resource: 'tickets',
        resourceId: saved.id,
        newValue: { ticketNumber, title: dto.title, status: 'OPEN' },
      });

      // Events live on the aggregate that raised them; the repository returns a fresh copy.
      await this.publishTicketEvents(ticket);

      return { saved, ticketNumber };
    });

    // After commit: AI analysis never runs for a ticket that was rolled back.
    await this.aiQueue.addTicketAnalysis(
      saved.id,
      dto.tenantId,
      `${dto.title}

${dto.description}`,
    );

    await this.invalidateDashboardCache(dto.tenantId);

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

    if (dto.title !== undefined && dto.title !== ticket.title) {
      oldValues.title = ticket.title;
      newValues.title = dto.title;
    }

    if (dto.description !== undefined && dto.description !== ticket.description) {
      oldValues.description = ticket.description;
      newValues.description = dto.description;
    }

    if (dto.tags !== undefined) {
      oldValues.tags = ticket.tags;
      newValues.tags = dto.tags;
    }

    if (dto.dueAt !== undefined && dto.dueAt.getTime() !== ticket.dueAt?.getTime()) {
      oldValues.dueAt = ticket.dueAt;
      newValues.dueAt = dto.dueAt;
    }

    ticket.updateDetails({
      title: dto.title,
      description: dto.description,
      tags: dto.tags,
      dueAt: dto.dueAt,
    });

    const changedFields = Object.keys(newValues);

    const updated = await this.inTransaction(async () => {
      const updated = await this.ticketRepo.update(ticket);

      if (changedFields.length === 0) {
        return updated;
      }

      const eventType =
        changedFields.length === 1 && changedFields[0] === 'priority'
          ? 'TICKET_PRIORITY_CHANGED'
          : changedFields.length === 1 && changedFields[0] === 'category'
            ? 'TICKET_CATEGORY_CHANGED'
            : 'TICKET_UPDATED';

      await this.activityRepo.create({
        tenantId: dto.tenantId,
        ticketId: dto.ticketId,
        actorId: dto.updatedById,
        actorRole: dto.updatedByRole,
        eventType,
        description: `Ticket updated: ${changedFields.join(', ')}`,
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

      return updated;
    });

    await this.invalidateDashboardCache(dto.tenantId);

    return updated;
  }

  async assignTicket(dto: AssignTicketDto): Promise<TicketEntity> {
    const ticket = await this.getTicketOrThrow(dto.ticketId, dto.tenantId);
    const assignmentPolicy = new TicketAssignmentPolicy();

    const agent = await this.findAssignableAgentOrThrow(dto.agentId, dto.tenantId);

    if (!assignmentPolicy.canAssign(ticket, agent.role)) {
      throw new ForbiddenError('This ticket cannot be assigned to the selected user');
    }

    const previousAgentId = ticket.assignedAgentId;
    ticket.assign(dto.agentId, dto.assignedById);

    const updated = await this.inTransaction(async () => {
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

      await this.publishTicketEvents(ticket);

      return updated;
    });

    await this.invalidateDashboardCache(dto.tenantId);

    return updated;
  }

  async changeStatus(dto: ChangeStatusDto): Promise<TicketEntity> {
    const ticket = await this.getTicketOrThrow(dto.ticketId, dto.tenantId);

    const oldStatus = ticket.status;
    const newStatus = TicketStatus.create(dto.newStatus);

    if (newStatus.isResolved()) {
      // resolve() also emits TicketResolvedEvent, which drives the customer notification.
      ticket.resolve(dto.changedById);
    } else {
      ticket.changeStatus(newStatus, dto.changedById);
    }

    const updated = await this.inTransaction(async () => {
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

      await this.publishTicketEvents(ticket);

      return updated;
    });

    await this.invalidateDashboardCache(dto.tenantId);

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
    const escalationPolicy = new TicketEscalationPolicy();

    if (!escalationPolicy.canEscalate(ticket)) {
      throw new DomainError('Ticket cannot be escalated in its current state');
    }

    ticket.escalate(dto.reason, dto.escalatedById);

    const updated = await this.inTransaction(async () => {
      const updated = await this.ticketRepo.update(ticket);

      await this.activityRepo.create({
        tenantId: dto.tenantId,
        ticketId: dto.ticketId,
        actorId: toActorUserId(dto.escalatedById),
        actorRole: dto.escalatedByRole,
        eventType: 'TICKET_ESCALATED',
        description: `Ticket escalated: ${dto.reason}`,
        newValue: { reason: dto.reason, escalatedAt: new Date() },
      });

      await this.auditRepo.create({
        tenantId: dto.tenantId,
        actorId: toActorUserId(dto.escalatedById),
        actorRole: dto.escalatedByRole,
        action: 'ESCALATE',
        resource: 'tickets',
        resourceId: dto.ticketId,
        newValue: { reason: dto.reason },
      });

      await this.publishTicketEvents(ticket);

      return updated;
    });

    await this.invalidateDashboardCache(dto.tenantId);

    logger.info('Ticket escalated', {
      ticketId: dto.ticketId,
      tenantId: dto.tenantId,
      reason: dto.reason,
    });

    return updated;
  }

  async addComment(dto: AddCommentDto): Promise<TicketCommentWithAuthor> {
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

    const commentEntity = TicketCommentEntity.create(commentId, {
      tenantId: dto.tenantId,
      ticketId: dto.ticketId,
      authorId: dto.authorId,
      content: dto.content,
      type: dto.type,
      isAiDraft: false,
      metadata: {},
    });

    await this.inTransaction(async () => {
      await this.commentRepo.save(commentEntity);

      // Update ticket status if customer replies to pending ticket
      if (dto.authorRole === 'CUSTOMER' && ticket.status === 'PENDING_CUSTOMER') {
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

      await this.publishTicketEvents(ticket);
      await this.eventBus.publishAll(commentEntity.pullDomainEvents());
    });

    // Fetch author details for the response format
    const authorDetails = {
      id: author.id,
      firstName: author.firstName,
      lastName: author.lastName,
      role: author.role,
      avatarUrl: author.avatarUrl,
    };

    const comment = {
      id: commentEntity.id,
      tenantId: commentEntity.tenantId,
      ticketId: commentEntity.ticketId,
      authorId: commentEntity.authorId,
      content: commentEntity.content,
      type: commentEntity.type,
      isAiDraft: commentEntity.isAiDraft,
      aiDraftId: commentEntity.aiDraftId ?? null,
      editedAt: commentEntity.editedAt ?? null,
      metadata: commentEntity.metadata,
      createdAt: new Date(), // Approximate, or we can fetch from DB
      updatedAt: new Date(),
      author: authorDetails,
    } as TicketCommentWithAuthor;

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

    logger.info('Comment added', {
      commentId,
      ticketId: dto.ticketId,
      tenantId: dto.tenantId,
      type: dto.type,
    });

    return comment;
  }

  async editComment(dto: EditCommentDto): Promise<TicketCommentEntity> {
    const comment = await this.commentRepo.findById(dto.commentId, dto.tenantId);

    if (!comment) {
      throw new NotFoundError('Comment', dto.commentId);
    }

    if (comment.authorId !== dto.authorId) {
      throw new ForbiddenError('You can only edit your own comments');
    }

    const ticket = await this.getTicketOrThrow(comment.ticketId, dto.tenantId);
    if (!ticket.isActive()) {
      throw new DomainError('Cannot edit comments on a closed or resolved ticket');
    }

    comment.edit(dto.content);

    return this.inTransaction(async () => {
      const updated = await this.commentRepo.update(comment);

      await this.activityRepo.create({
        tenantId: dto.tenantId,
        ticketId: comment.ticketId,
        actorId: dto.authorId,
        actorRole: dto.authorRole,
        eventType: 'COMMENT_EDITED',
        description: 'Comment was edited',
        newValue: { commentId: comment.id },
      });

      return updated;
    });
  }

  async deleteComment(dto: DeleteCommentDto): Promise<void> {
    const comment = await this.commentRepo.findById(dto.commentId, dto.tenantId);

    if (!comment) {
      throw new NotFoundError('Comment', dto.commentId);
    }

    if (
      comment.authorId !== dto.authorId &&
      dto.authorRole !== 'PLATFORM_ADMIN' &&
      dto.authorRole !== 'TENANT_MANAGER'
    ) {
      throw new ForbiddenError('You do not have permission to delete this comment');
    }

    const ticket = await this.getTicketOrThrow(comment.ticketId, dto.tenantId);
    if (!ticket.isActive() && dto.authorRole !== 'PLATFORM_ADMIN') {
      throw new DomainError('Cannot delete comments on a closed or resolved ticket');
    }

    await this.inTransaction(async () => {
      await this.commentRepo.delete(dto.commentId, dto.tenantId);

      await this.activityRepo.create({
        tenantId: dto.tenantId,
        ticketId: comment.ticketId,
        actorId: dto.authorId,
        actorRole: dto.authorRole,
        eventType: 'COMMENT_DELETED',
        description: 'Comment was deleted',
        oldValue: { commentId: comment.id },
      });
    });
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
    data: ActivityLog[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    // Verify ticket belongs to tenant
    await this.getTicketOrThrow(ticketId, tenantId);

    return this.activityRepo.findByTicket(ticketId, tenantId, page, limit);
  }

  private async publishTicketEvents(ticket: TicketEntity): Promise<void> {
    const events = ticket.pullDomainEvents();
    await this.eventBus.publishAll(events);
  }

  private async invalidateDashboardCache(tenantId: string): Promise<void> {
    await this.dashboardCache.invalidate(tenantId);
  }

  /** Tickets may only be assigned to active staff of the same organization. */
  private async findAssignableAgentOrThrow(agentId: string, tenantId: string) {
    const agent = await this.prisma.user.findFirst({
      where: {
        id: agentId,
        tenantId,
        role: { in: ['AGENT', 'TENANT_MANAGER'] },
        status: 'ACTIVE',
      },
    });

    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    return agent;
  }

  private async getTicketOrThrow(id: string, tenantId: string): Promise<TicketEntity> {
    const ticket = await this.ticketRepo.findById(id, tenantId);

    if (!ticket) {
      throw new NotFoundError('Ticket', id);
    }

    return ticket;
  }
}
