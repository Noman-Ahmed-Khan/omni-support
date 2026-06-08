import crypto from 'crypto';

import { TenantEntity } from '../../../domain/tenant/entities/tenant.entity';
import type {
  ITenantRepository,
  PaginatedResult,
} from '../../../domain/tenant/repositories/tenant.repository.interface';
import { TenantSlug } from '../../../domain/tenant/value-objects/tenant-slug.vo';
import { TenantStatus } from '../../../domain/tenant/value-objects/tenant-status.vo';
import type { AuditRepository } from '../../../infrastructure/database/repositories/audit.repository';
import { ConflictError, NotFoundError } from '../../../shared/errors/domain.error';
import type { IEventBus } from '../../event-bus/event-bus.interface';
import type { CreateTenantCommand } from '../commands/create-tenant.command';
import type { SuspendTenantCommand } from '../commands/suspend-tenant.command';
import type { UpdateTenantCommand } from '../commands/update-tenant.command';
import type { RestoreTenantCommand } from '../handlers/restore-tenant.handler';
import type { GetTenantQuery } from '../queries/get-tenant.query';
import type { ListTenantsQuery } from '../queries/list-tenants.query';

export class TenantService {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly auditRepo: AuditRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async createTenant(command: CreateTenantCommand): Promise<TenantEntity> {
    const tenantSlug = TenantSlug.create(command.slug ?? command.name);

    if (await this.tenantRepo.existsBySlug(tenantSlug.toString())) {
      throw new ConflictError('Organization slug already taken');
    }

    if (command.domain && (await this.tenantRepo.existsByDomain(command.domain))) {
      throw new ConflictError('Domain already registered');
    }

    const tenant = TenantEntity.create(crypto.randomUUID(), {
      name: command.name,
      slug: tenantSlug,
      status: TenantStatus.trial(),
      plan: command.plan ?? 'starter',
      domain: command.domain,
      maxAgents: command.maxAgents ?? 5,
      maxCustomers: command.maxCustomers ?? 1000,
      maxTicketsPerDay: 500,
      settings: {},
    });

    const saved = await this.tenantRepo.save(tenant);

    await this.auditRepo.create({
      actorId: command.actorId,
      actorRole: command.actorRole,
      action: 'CREATE',
      resource: 'tenants',
      resourceId: saved.id,
      newValue: { name: command.name, slug: tenantSlug.toString() },
    });

    await this.eventBus.publishAll(saved.pullDomainEvents());

    return saved;
  }

  async updateTenant(command: UpdateTenantCommand): Promise<TenantEntity> {
    const tenant = await this.tenantRepo.findById(command.tenantId);
    if (!tenant) throw new NotFoundError('Tenant', command.tenantId);

    tenant.updateSettings(command.settings ?? {});
    const updated = await this.tenantRepo.update(tenant);

    await this.auditRepo.create({
      tenantId: command.tenantId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      action: 'UPDATE',
      resource: 'tenants',
      resourceId: command.tenantId,
      newValue: { settings: command.settings ?? {} },
    });

    return updated;
  }

  async suspendTenant(command: SuspendTenantCommand): Promise<TenantEntity> {
    const tenant = await this.tenantRepo.findById(command.tenantId);
    if (!tenant) throw new NotFoundError('Tenant', command.tenantId);

    tenant.suspend(command.reason);
    const updated = await this.tenantRepo.update(tenant);

    await this.auditRepo.create({
      tenantId: command.tenantId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      action: 'SUSPEND',
      resource: 'tenants',
      resourceId: command.tenantId,
      newValue: { reason: command.reason },
    });

    await this.eventBus.publishAll(updated.pullDomainEvents());

    return updated;
  }

  async restoreTenant(command: RestoreTenantCommand): Promise<TenantEntity> {
    const tenant = await this.tenantRepo.findById(command.tenantId);
    if (!tenant) throw new NotFoundError('Tenant', command.tenantId);

    tenant.activate();
    const updated = await this.tenantRepo.update(tenant);

    await this.auditRepo.create({
      tenantId: command.tenantId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      action: 'RESTORE',
      resource: 'tenants',
      resourceId: command.tenantId,
    });

    return updated;
  }

  async getTenant(query: GetTenantQuery): Promise<TenantEntity> {
    const tenant = await this.tenantRepo.findById(query.tenantId);
    if (!tenant) throw new NotFoundError('Tenant', query.tenantId);
    return tenant;
  }

  async listTenants(query: ListTenantsQuery): Promise<PaginatedResult<TenantEntity>> {
    return this.tenantRepo.findAll(query.filters, query.page, query.limit);
  }
}
