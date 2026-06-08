import type { Request, Response, NextFunction } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';

import type { CreateTenantHandler } from '../../../application/tenant/handlers/create-tenant.handler';
import type { GetTenantHandler } from '../../../application/tenant/handlers/get-tenant.handler';
import type { ListTenantsHandler } from '../../../application/tenant/handlers/list-tenants.handler';
import type { RestoreTenantHandler } from '../../../application/tenant/handlers/restore-tenant.handler';
import type { SuspendTenantHandler } from '../../../application/tenant/handlers/suspend-tenant.handler';
import type { UpdateTenantHandler } from '../../../application/tenant/handlers/update-tenant.handler';
import type { TenantEntity } from '../../../domain/tenant/entities/tenant.entity';
import { successResponse, paginatedResponse } from '../dtos/common/response.dto';
import type {
  CreateTenantDto,
  UpdateTenantDto,
  SuspendTenantDto,
} from '../dtos/tenant/tenant.dto';

export class TenantController {
  constructor(
    private readonly createTenantHandler: CreateTenantHandler,
    private readonly updateTenantHandler: UpdateTenantHandler,
    private readonly suspendTenantHandler: SuspendTenantHandler,
    private readonly restoreTenantHandler: RestoreTenantHandler,
    private readonly getTenantHandler: GetTenantHandler,
    private readonly listTenantsHandler: ListTenantsHandler,
  ) {}

  async create(
    req: Request<ParamsDictionary, unknown, CreateTenantDto, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const saved = await this.createTenantHandler.execute({
        actorId: req.user!.id,
        actorRole: req.user!.role,
        name: req.body.name,
        slug: req.body.slug,
        domain: req.body.domain,
        plan: req.body.plan,
        maxAgents: req.body.maxAgents,
        maxCustomers: req.body.maxCustomers,
      });

      res.status(201).json(successResponse(this.toTenantResponse(saved)));
    } catch (error) {
      next(error);
    }
  }

  async findAll(
    req: Request<
      ParamsDictionary,
      unknown,
      unknown,
      {
        page?: string;
        limit?: string;
        status?: string;
        plan?: string;
        search?: string;
      }
    >,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { page, limit, status, plan, search } = req.query;

      const result = await this.listTenantsHandler.execute({
        filters: { status, plan, search },
        page: Number(page ?? 1),
        limit: Number(limit ?? 20),
      });

      res.status(200).json(
        paginatedResponse(
          result.data.map((tenant) => this.toTenantResponse(tenant)),
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
      const tenant = await this.getTenantHandler.execute({
        tenantId: req.params.id,
      });

      res.status(200).json(successResponse(this.toTenantResponse(tenant)));
    } catch (error) {
      next(error);
    }
  }

  async update(
    req: Request<ParamsDictionary, unknown, UpdateTenantDto, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const updated = await this.updateTenantHandler.execute({
        tenantId: req.params.id,
        actorId: req.user!.id,
        actorRole: req.user!.role,
        settings: req.body.settings,
      });

      res.status(200).json(successResponse(this.toTenantResponse(updated)));
    } catch (error) {
      next(error);
    }
  }

  async suspend(
    req: Request<ParamsDictionary, unknown, SuspendTenantDto, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const updated = await this.suspendTenantHandler.execute({
        tenantId: req.params.id,
        actorId: req.user!.id,
        actorRole: req.user!.role,
        reason: req.body.reason,
      });

      res.status(200).json(successResponse(this.toTenantResponse(updated)));
    } catch (error) {
      next(error);
    }
  }

  async restore(
    req: Request<ParamsDictionary, unknown, unknown, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const updated = await this.restoreTenantHandler.execute({
        tenantId: req.params.id,
        actorId: req.user!.id,
        actorRole: req.user!.role,
      });

      res.status(200).json(successResponse(this.toTenantResponse(updated)));
    } catch (error) {
      next(error);
    }
  }

  private toTenantResponse(tenant: TenantEntity): Record<string, unknown> {
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      domain: tenant.domain,
      status: tenant.status,
      plan: tenant.plan,
      maxAgents: tenant.maxAgents,
      maxCustomers: tenant.maxCustomers,
      settings: tenant.settings,
      suspendedAt: tenant.suspendedAt,
      suspendedReason: tenant.suspendedReason,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  }
}
