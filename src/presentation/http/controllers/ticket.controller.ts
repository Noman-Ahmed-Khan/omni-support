import type { Request, Response, NextFunction } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';

import type { AddCommentHandler } from '../../../application/ticket/handlers/add-comment.handler';
import type { AssignTicketHandler } from '../../../application/ticket/handlers/assign-ticket.handler';
import type { ChangeTicketStatusHandler } from '../../../application/ticket/handlers/change-ticket-status.handler';
import type { CreateTicketHandler } from '../../../application/ticket/handlers/create-ticket.handler';
import type { EscalateTicketHandler } from '../../../application/ticket/handlers/escalate-ticket.handler';
import type { GetTicketHandler } from '../../../application/ticket/handlers/get-ticket.handler';
import type { ListTicketsHandler } from '../../../application/ticket/handlers/list-tickets.handler';
import type { TicketHistoryHandler } from '../../../application/ticket/handlers/ticket-history.handler';
import type { UpdateTicketHandler } from '../../../application/ticket/handlers/update-ticket.handler';
import type {
  TicketAccessService,
  TicketActor,
} from '../../../application/ticket/services/ticket-access.service';
import type { TicketEntity } from '../../../domain/ticket/entities/ticket.entity';
import { ValidationError } from '../../../shared/errors/domain.error';
import { successResponse, paginatedResponse } from '../dtos/common/response.dto';
import type {
  CreateTicketDto,
  UpdateTicketDto,
  AssignTicketDto,
  ChangeStatusDto,
  EscalateTicketDto,
  AddCommentDto,
  ListTicketsQueryDto,
  TicketHistoryQuery,
} from '../dtos/ticket/ticket.dto';

export class TicketController {
  constructor(
    private readonly createTicketHandler: CreateTicketHandler,
    private readonly updateTicketHandler: UpdateTicketHandler,
    private readonly assignTicketHandler: AssignTicketHandler,
    private readonly changeTicketStatusHandler: ChangeTicketStatusHandler,
    private readonly escalateTicketHandler: EscalateTicketHandler,
    private readonly addCommentHandler: AddCommentHandler,
    private readonly getTicketHandler: GetTicketHandler,
    private readonly listTicketsHandler: ListTicketsHandler,
    private readonly ticketHistoryHandler: TicketHistoryHandler,
    private readonly ticketAccess: TicketAccessService,
  ) {}

  /**
   * Route-parameter guard for `:id`: the ticket must be in the caller's organization and
   * visible to them (see TicketAccessPolicy) before any ticket route runs.
   */
  async authorizeTicket(
    req: Request,
    _res: Response,
    next: NextFunction,
    ticketId: string,
  ): Promise<void> {
    try {
      await this.ticketAccess.assertCanAccess(toActor(req), ticketId);
      next();
    } catch (error) {
      next(error);
    }
  }

  async create(
    req: Request<ParamsDictionary, unknown, CreateTicketDto, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const isCustomer = req.user!.role === 'CUSTOMER';

      // Customers always file tickets for their own record and cannot set triage fields.
      const customerId = isCustomer
        ? await this.ticketAccess.requireOwnCustomerId(toActor(req))
        : req.body.customerId;
      if (!customerId)
        throw new ValidationError('Customer ID is required for staff tickets');

      const ticket = await this.createTicketHandler.execute({
        tenantId: req.tenantId!,
        customerId,
        createdById: req.user!.id,
        createdByRole: req.user!.role,
        title: req.body.title,
        description: req.body.description,
        priority: isCustomer ? undefined : req.body.priority,
        category: req.body.category,
        tags: req.body.tags,
        source: req.body.source,
        assignedAgentId: isCustomer ? undefined : req.body.assignedAgentId,
        dueAt: !isCustomer && req.body.dueAt ? new Date(req.body.dueAt) : undefined,
      });

      res.status(201).json(successResponse(this.toTicketResponse(ticket)));
    } catch (error) {
      next(error);
    }
  }

  async findAll(
    req: Request<ParamsDictionary, unknown, unknown, ListTicketsQueryDto>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const {
        page,
        limit,
        sortBy,
        sortOrder,
        status,
        priority,
        category,
        assignedAgentId,
        customerId,
        isEscalated,
        search,
        dateFrom,
        dateTo,
        tags,
      } = req.query;

      // Agents see their assigned tickets, customers the tickets of their own record.
      const scope = await this.ticketAccess.listScope(toActor(req));
      if (scope.none) {
        res.status(200).json(paginatedResponse([], 0, Number(page), Number(limit)));
        return;
      }

      const result = await this.listTicketsHandler.execute({
        filters: {
          tenantId: req.tenantId!,
          status,
          priority,
          category,
          assignedAgentId: scope.assignedAgentId ?? assignedAgentId,
          customerId: scope.customerId ?? customerId,
          isEscalated,
          search,
          dateFrom: dateFrom ? new Date(dateFrom) : undefined,
          dateTo: dateTo ? new Date(dateTo) : undefined,
          tags,
        },
        pagination: { page: Number(page), limit: Number(limit), sortBy, sortOrder },
      });

      res.status(200).json(
        paginatedResponse(
          result.data.map((ticket) => this.toTicketResponse(ticket)),
          result.total,
          result.page,
          result.limit,
        ),
      );
    } catch (error) {
      next(error);
    }
  }

  async findOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ticket = await this.getTicketHandler.execute({
        ticketId: req.params.id,
        tenantId: req.tenantId!,
      });

      // Visibility was checked by authorizeTicket (router.param('id')).

      res.status(200).json(successResponse(this.toTicketResponse(ticket)));
    } catch (error) {
      next(error);
    }
  }

  async update(
    req: Request<ParamsDictionary, unknown, UpdateTicketDto, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ticket = await this.updateTicketHandler.execute({
        tenantId: req.tenantId!,
        ticketId: req.params.id,
        updatedById: req.user!.id,
        updatedByRole: req.user!.role,
        ...req.body,
        dueAt: req.body.dueAt ? new Date(req.body.dueAt) : undefined,
      });

      res.status(200).json(successResponse(this.toTicketResponse(ticket)));
    } catch (error) {
      next(error);
    }
  }

  async assign(
    req: Request<ParamsDictionary, unknown, AssignTicketDto, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ticket = await this.assignTicketHandler.execute({
        tenantId: req.tenantId!,
        ticketId: req.params.id,
        agentId: req.body.agentId,
        assignedById: req.user!.id,
        assignedByRole: req.user!.role,
      });

      res.status(200).json(successResponse(this.toTicketResponse(ticket)));
    } catch (error) {
      next(error);
    }
  }

  async changeStatus(
    req: Request<ParamsDictionary, unknown, ChangeStatusDto, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ticket = await this.changeTicketStatusHandler.execute({
        tenantId: req.tenantId!,
        ticketId: req.params.id,
        newStatus: req.body.status,
        changedById: req.user!.id,
        changedByRole: req.user!.role,
      });

      res.status(200).json(successResponse(this.toTicketResponse(ticket)));
    } catch (error) {
      next(error);
    }
  }

  async escalate(
    req: Request<ParamsDictionary, unknown, EscalateTicketDto, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ticket = await this.escalateTicketHandler.execute({
        tenantId: req.tenantId!,
        ticketId: req.params.id,
        reason: req.body.reason,
        escalatedById: req.user!.id,
        escalatedByRole: req.user!.role,
      });

      res.status(200).json(successResponse(this.toTicketResponse(ticket)));
    } catch (error) {
      next(error);
    }
  }

  async addComment(
    req: Request<ParamsDictionary, unknown, AddCommentDto, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const comment = await this.addCommentHandler.execute({
        tenantId: req.tenantId!,
        ticketId: req.params.id,
        authorId: req.user!.id,
        authorRole: req.user!.role,
        content: req.body.content,
        type: req.body.type,
      });

      res.status(201).json(successResponse(comment));
    } catch (error) {
      next(error);
    }
  }

  async getHistory(
    req: Request<ParamsDictionary, unknown, unknown, TicketHistoryQuery>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      // page/limit are validated and bounded by ticketHistoryQuerySchema
      const { page, limit } = req.query;

      const history = await this.ticketHistoryHandler.execute({
        ticketId: req.params.id,
        tenantId: req.tenantId!,
        page,
        limit,
      });

      res
        .status(200)
        .json(
          paginatedResponse(history.data, history.total, history.page, history.limit),
        );
    } catch (error) {
      next(error);
    }
  }

  private toTicketResponse(ticket: TicketEntity): Record<string, unknown> {
    return {
      id: ticket.id,
      tenantId: ticket.tenantId,
      ticketNumber: ticket.ticketNumber,
      customerId: ticket.customerId,
      assignedAgentId: ticket.assignedAgentId,
      createdById: ticket.createdById,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category,
      tags: ticket.tags,
      source: ticket.source,
      isEscalated: ticket.isEscalated,
      escalatedAt: ticket.escalatedAt,
      escalatedReason: ticket.escalatedReason,
      resolvedAt: ticket.resolvedAt,
      closedAt: ticket.closedAt,
      firstResponseAt: ticket.firstResponseAt,
      dueAt: ticket.dueAt,
      slaBreached: ticket.slaBreached,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    };
  }
}

function toActor(req: Pick<Request, 'user' | 'tenantId'>): TicketActor {
  return {
    id: req.user!.id,
    role: req.user!.role,
    email: req.user!.email,
    tenantId: req.tenantId!,
  };
}
