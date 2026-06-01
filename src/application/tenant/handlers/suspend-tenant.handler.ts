import { TenantEntity } from '../../../domain/tenant/entities/tenant.entity';
import { ITenantRepository } from '../../../domain/tenant/repositories/tenant.repository.interface';
import { AuditRepository } from '../../../infrastructure/database/repositories/audit.repository';
import { NotFoundError } from '../../../shared/errors/domain.error';
import { IEventBus } from '../../event-bus/event-bus.interface';
import { SuspendTenantCommand } from '../commands/suspend-tenant.command';

export class SuspendTenantHandler {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly auditRepo: AuditRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(command: SuspendTenantCommand): Promise<TenantEntity> {
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
}
