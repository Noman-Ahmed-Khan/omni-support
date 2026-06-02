import { Request, Response, NextFunction } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { CreateTicketHandler } from '../../../application/ticket/handlers/create-ticket.handler';
import { UpdateTicketHandler } from '../../../application/ticket/handlers/update-ticket.handler';
import { AssignTicketHandler } from '../../../application/ticket/handlers/assign-ticket.handler';
import { ChangeTicketStatusHandler } from '../../../application/ticket/handlers/change-ticket-status.handler';
import { EscalateTicketHandler } from '../../../application/ticket/handlers/escalate-ticket.handler';
import { AddCommentHandler } from '../../../application/ticket/handlers/add-comment.handler';
import { GetTicketHandler } from '../../../application/ticket/handlers/get-ticket.handler';
import { ListTicketsHandler } from '../../../application/ticket/handlers/list-tickets.handler';
import { TicketHistoryHandler } from '../../../application/ticket/handlers/ticket-history.handler';
import { TicketEntity } from '../../../domain/ticket/entities/ticket.entity';
import {
  CreateTicketDto,
  UpdateTicketDto,
  AssignTicketDto,
  ChangeStatusDto,
  EscalateTicketDto,
  AddCommentDto,
  ListTicketsQueryDto,
} from '../dtos/ticket/ticket.dto';
import { successResponse, paginatedResponse } from '../dtos/common/response.dto';

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
  ) {}

  async create(
    req: Request<ParamsDictionary, unknown, CreateTicketDto, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ticket = await this.createTicketHandler.execute({
        tenantId: req.tenantId!,
        customerId: req.body.customerId,
        createdById: req.user!.id,
        createdByRole: req.user!.role,
        title: req.body.title,
        description: req.body.description,
        priority: req.body.priority,
        category: req.body.category,
        tags: req.body.tags,
        source: req.body.source,
        assignedAgentId: req.body.assignedAgentId,
        dueAt: req.body.dueAt ? new Date(req.body.dueAt) : undefined,
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

      // Agents can only see their own tickets
      const effectiveAgentId =
        req.user!.role === 'AGENT' ? req.user!.id : assignedAgentId;

      const result = await this.listTicketsHandler.execute({
        filters: {
          tenantId: req.tenantId!,
          status,
          priority,
          category,
          assignedAgentId: effectiveAgentId,
          customerId,
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

      // Agents can only view their assigned tickets
      if (req.user!.role === 'AGENT' && ticket.assignedAgentId !== req.user!.id) {
        res.status(403).json({
          type: 'https://omnisupport.io/errors/forbidden',
          title: 'Forbidden',
          status: 403,
          detail: 'You can only view tickets assigned to you',
        });
        return;
      }

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
    req: Request<ParamsDictionary, unknown, unknown, { page?: string; limit?: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { page, limit } = req.query;

      const history = await this.ticketHistoryHandler.execute({
        ticketId: req.params.id,
        tenantId: req.tenantId!,
        page: Number(page ?? 1),
        limit: Number(limit ?? 50),
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
