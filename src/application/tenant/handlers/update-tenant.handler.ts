import { TenantEntity } from '../../../domain/tenant/entities/tenant.entity';
import { ITenantRepository } from '../../../domain/tenant/repositories/tenant.repository.interface';
import { AuditRepository } from '../../../infrastructure/database/repositories/audit.repository';
import { NotFoundError } from '../../../shared/errors/domain.error';
import { UpdateTenantCommand } from '../commands/update-tenant.command';

export class UpdateTenantHandler {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly auditRepo: AuditRepository,
  ) {}

  async execute(command: UpdateTenantCommand): Promise<TenantEntity> {
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
}
