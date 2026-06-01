import { TenantEntity } from '../../../domain/tenant/entities/tenant.entity';
import { ITenantRepository } from '../../../domain/tenant/repositories/tenant.repository.interface';
import { AuditRepository } from '../../../infrastructure/database/repositories/audit.repository';
import { NotFoundError } from '../../../shared/errors/domain.error';

export interface RestoreTenantCommand {
  tenantId: string;
  actorId: string;
  actorRole: string;
}

export class RestoreTenantHandler {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly auditRepo: AuditRepository,
  ) {}

  async execute(command: RestoreTenantCommand): Promise<TenantEntity> {
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
}
