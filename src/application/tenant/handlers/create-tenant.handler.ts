import crypto from 'crypto';
import { TenantEntity } from '../../../domain/tenant/entities/tenant.entity';
import { ITenantRepository } from '../../../domain/tenant/repositories/tenant.repository.interface';
import { TenantSlug } from '../../../domain/tenant/value-objects/tenant-slug.vo';
import { TenantStatus } from '../../../domain/tenant/value-objects/tenant-status.vo';
import { AuditRepository } from '../../../infrastructure/database/repositories/audit.repository';
import { ConflictError } from '../../../shared/errors/domain.error';
import { IEventBus } from '../../event-bus/event-bus.interface';
import { CreateTenantCommand } from '../commands/create-tenant.command';

export class CreateTenantHandler {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly auditRepo: AuditRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(command: CreateTenantCommand): Promise<TenantEntity> {
    const tenantSlug = TenantSlug.create(command.slug ?? command.name);

    if (await this.tenantRepo.existsBySlug(tenantSlug.toString())) {
      throw new ConflictError('Organization slug already taken');
    }

    if (command.domain && await this.tenantRepo.existsByDomain(command.domain)) {
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
}
