import { Request, Response, NextFunction } from 'express';
import { CreateCustomerHandler } from '../../../application/customer/handlers/create-customer.handler';
import { UpdateCustomerHandler } from '../../../application/customer/handlers/update-customer.handler';
import { DeleteCustomerHandler } from '../../../application/customer/handlers/delete-customer.handler';
import { GetCustomerHandler } from '../../../application/customer/handlers/get-customer.handler';
import { ListCustomersHandler } from '../../../application/customer/handlers/list-customers.handler';
import { CustomerTimelineHandler } from '../../../application/customer/handlers/customer-timeline.handler';
import { TriggerRiskScoreHandler } from '../../../application/customer/handlers/trigger-risk-score.handler';
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

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
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

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
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
      } = req.query as any;

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
      }) as any;

      res.status(200).json(
        paginatedResponse(
          result.data.map(this.toCustomerResponse),
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
      const customer = await this.getCustomerHandler.execute({
        customerId: req.params.id,
        tenantId: req.tenantId!,
      });

      res.status(200).json(successResponse(this.toCustomerResponse(customer)));
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
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

  async getTimeline(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, limit } = req.query;

      const timeline = await this.customerTimelineHandler.execute({
        customerId: req.params.id,
        tenantId: req.tenantId!,
        page: Number(page ?? 1),
        limit: Number(limit ?? 50),
      }) as any;

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

  private toCustomerResponse(customer: any): Record<string, unknown> {
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
