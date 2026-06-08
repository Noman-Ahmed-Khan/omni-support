import type { TenantEntity } from '../../../domain/tenant/entities/tenant.entity';
import type { SuspendTenantCommand } from '../commands/suspend-tenant.command';
import type { TenantService } from '../services/tenant.service';

export class SuspendTenantHandler {
  constructor(private readonly tenantService: TenantService) {}

  async execute(command: SuspendTenantCommand): Promise<TenantEntity> {
    return this.tenantService.suspendTenant(command);
  }
}
