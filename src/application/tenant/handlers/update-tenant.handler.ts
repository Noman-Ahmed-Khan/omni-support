import type { TenantEntity } from '../../../domain/tenant/entities/tenant.entity';
import type { UpdateTenantCommand } from '../commands/update-tenant.command';
import type { TenantService } from '../services/tenant.service';

export class UpdateTenantHandler {
  constructor(private readonly tenantService: TenantService) {}

  async execute(command: UpdateTenantCommand): Promise<TenantEntity> {
    return this.tenantService.updateTenant(command);
  }
}
