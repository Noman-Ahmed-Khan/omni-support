import { Request, Response, NextFunction } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { CreateCustomerHandler } from '../../../application/customer/handlers/create-customer.handler';
import { UpdateCustomerHandler } from '../../../application/customer/handlers/update-customer.handler';
import { DeleteCustomerHandler } from '../../../application/customer/handlers/delete-customer.handler';
import { GetCustomerHandler } from '../../../application/customer/handlers/get-customer.handler';
import { ListCustomersHandler } from '../../../application/customer/handlers/list-customers.handler';
import { CustomerTimelineHandler } from '../../../application/customer/handlers/customer-timeline.handler';
import { TriggerRiskScoreHandler } from '../../../application/customer/handlers/trigger-risk-score.handler';
import { CustomerEntity } from '../../../domain/customer/entities/customer.entity';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  ListCustomersQueryDto,
} from '../dtos/customer/customer.dto';
import {
  successResponse,
  paginatedResponse,
} from '../dtos/common/response.dto';

export class CustomerController {
  constructor(
    private readonly createCustomerHandler: CreateCustomerHandler,
    private readonly updateCustomerHandler: UpdateCustomerHandler,
    private readonly deleteCustomerHandler: DeleteCustomerHandler,
    private readonly getCustomerHandler: GetCustomerHandler,
    private readonly listCustomersHandler: ListCustomersHandler,
    private readonly customerTimelineHandler: CustomerTimelineHandler,
    private readonly triggerRiskScoreHandler: TriggerRiskScoreHandler,
  ) {}

  async create(
    req: Request<ParamsDictionary, unknown, CreateCustomerDto, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const customer = await this.createCustomerHandler.execute({
        tenantId: req.tenantId!,
        createdById: req.user!.id,
        createdByRole: req.user!.role,
        fullName: req.body.fullName,
        email: req.body.email,
        phone: req.body.phone,
        company: req.body.company,
        notes: req.body.notes,
        assignedAgentId: req.body.assignedAgentId,
        externalId: req.body.externalId,
      });

      res.status(201).json(successResponse(this.toCustomerResponse(customer)));
    } catch (error) {
      next(error);
    }
  }

  async findAll(
    req: Request<ParamsDictionary, unknown, unknown, ListCustomersQueryDto>,
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
        assignedAgentId,
        riskLabel,
        search,
      } = req.query;

      const effectiveAgentId =
        req.user!.role === 'AGENT' ? req.user!.id : assignedAgentId;

      const result = await this.listCustomersHandler.execute({
        filters: {
          tenantId: req.tenantId!,
          status,
          assignedAgentId: effectiveAgentId,
          riskLabel,
          search,
        },
        pagination: { page: Number(page), limit: Number(limit), sortBy, sortOrder },
      });

      res.status(200).json(
        paginatedResponse(
          result.data.map((customer) => this.toCustomerResponse(customer)),
          result.total,
          result.page,
          result.limit,
        ),
      );
    } catch (error) {
      next(error);
    }
  }

  async findOne(
    req: Request<ParamsDictionary>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const customer = await this.getCustomerHandler.execute({
        customerId: req.params.id,
        tenantId: req.tenantId!,
      });

      res.status(200).json(successResponse(this.toCustomerResponse(customer)));
    } catch (error) {
      next(error);
    }
  }

  async update(
    req: Request<ParamsDictionary, unknown, UpdateCustomerDto, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const customer = await this.updateCustomerHandler.execute({
        tenantId: req.tenantId!,
        customerId: req.params.id,
        updatedById: req.user!.id,
        updatedByRole: req.user!.role,
        ...req.body,
      });

      res.status(200).json(successResponse(this.toCustomerResponse(customer)));
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.deleteCustomerHandler.execute({
        customerId: req.params.id,
        tenantId: req.tenantId!,
        deletedById: req.user!.id,
        deletedByRole: req.user!.role,
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  async getTimeline(
    req: Request<ParamsDictionary, unknown, unknown, { page?: string; limit?: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { page, limit } = req.query;

      const timeline = await this.customerTimelineHandler.execute({
        customerId: req.params.id,
        tenantId: req.tenantId!,
        page: Number(page ?? 1),
        limit: Number(limit ?? 50),
      });

      res.status(200).json(
        paginatedResponse(
          timeline.data,
          timeline.total,
          timeline.page,
          timeline.limit,
        ),
      );
    } catch (error) {
      next(error);
    }
  }

  async triggerRiskScore(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.triggerRiskScoreHandler.execute({
        customerId: req.params.id,
        tenantId: req.tenantId!,
      });

      res.status(202).json(
        successResponse({ message: 'Risk score calculation queued' }),
      );
    } catch (error) {
      next(error);
    }
  }

  private toCustomerResponse(customer: CustomerEntity): Record<string, unknown> {
    return {
      id: customer.id,
      tenantId: customer.tenantId,
      assignedAgentId: customer.assignedAgentId,
      fullName: customer.fullName,
      email: customer.email,
      phone: customer.phone,
      company: customer.company,
      notes: customer.notes,
      status: customer.status,
      riskScore: customer.riskScore,
      riskLabel: customer.riskLabel,
      externalId: customer.externalId,
      lastActivityAt: customer.lastActivityAt,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }
}
