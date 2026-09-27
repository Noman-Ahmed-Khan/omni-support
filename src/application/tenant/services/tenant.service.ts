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
import { toActorUserId } from '../../../shared/utils/system-actor.util';
import type { IEventBus } from '../../event-bus/event-bus.interface';
import type { CreateTenantCommand } from '../commands/create-tenant.command';
import type { SuspendTenantCommand } from '../commands/suspend-tenant.command';
import type { UpdateTenantCommand } from '../commands/update-tenant.command';
import type { RestoreTenantCommand } from '../handlers/restore-tenant.handler';
import type { GetTenantQuery } from '../queries/get-tenant.query';
import type { ListTenantsQuery } from '../queries/list-tenants.query';

export interface TenantSessionRevoker {
  revokeAllTenantTokens(tenantId: string, reason: string): Promise<void>;
}

export class TenantService {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly auditRepo: AuditRepository,
    private readonly eventBus: IEventBus,
    private readonly sessionRevoker?: TenantSessionRevoker,
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
      actorId: toActorUserId(command.actorId),
      actorRole: command.actorRole,
      action: 'CREATE',
      resource: 'tenants',
      resourceId: saved.id,
      newValue: { name: command.name, slug: tenantSlug.toString() },
    });

    // Events live on the aggregate that raised them; the repository returns a fresh copy.
    await this.eventBus.publishAll(tenant.pullDomainEvents());

    return saved;
  }

  async updateTenant(command: UpdateTenantCommand): Promise<TenantEntity> {
    const tenant = await this.tenantRepo.findById(command.tenantId);
    if (!tenant) throw new NotFoundError('Tenant', command.tenantId);

    if (
      command.domain &&
      command.domain !== tenant.domain &&
      (await this.tenantRepo.existsByDomain(command.domain))
    ) {
      throw new ConflictError('Domain already registered');
    }

    tenant.updateDetails(command);
    tenant.updateSettings(command.settings ?? {});
    const updated = await this.tenantRepo.update(tenant);

    await this.auditRepo.create({
      tenantId: command.tenantId,
      actorId: toActorUserId(command.actorId),
      actorRole: command.actorRole,
      action: 'UPDATE',
      resource: 'tenants',
      resourceId: command.tenantId,
      newValue: {
        name: command.name,
        domain: command.domain,
        plan: command.plan,
        maxAgents: command.maxAgents,
        maxCustomers: command.maxCustomers,
        maxTicketsPerDay: command.maxTicketsPerDay,
        settings: command.settings,
      },
    });

    return updated;
  }

  async suspendTenant(command: SuspendTenantCommand): Promise<TenantEntity> {
    const tenant = await this.tenantRepo.findById(command.tenantId);
    if (!tenant) throw new NotFoundError('Tenant', command.tenantId);

    tenant.suspend(command.reason);
    const updated = await this.tenantRepo.update(tenant);

    // Members of a suspended organization must not keep refreshing their sessions.
    await this.sessionRevoker?.revokeAllTenantTokens(
      command.tenantId,
      'TENANT_SUSPENDED',
    );

    await this.auditRepo.create({
      tenantId: command.tenantId,
      actorId: toActorUserId(command.actorId),
      actorRole: command.actorRole,
      action: 'SUSPEND',
      resource: 'tenants',
      resourceId: command.tenantId,
      newValue: { reason: command.reason },
    });

    await this.eventBus.publishAll(tenant.pullDomainEvents());

    return updated;
  }

  async restoreTenant(command: RestoreTenantCommand): Promise<TenantEntity> {
    const tenant = await this.tenantRepo.findById(command.tenantId);
    if (!tenant) throw new NotFoundError('Tenant', command.tenantId);

    tenant.activate();
    const updated = await this.tenantRepo.update(tenant);

    await this.auditRepo.create({
      tenantId: command.tenantId,
      actorId: toActorUserId(command.actorId),
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
