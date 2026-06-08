import type { TenantEntity } from '../../../domain/tenant/entities/tenant.entity';
import type { CreateTenantCommand } from '../commands/create-tenant.command';
import type { TenantService } from '../services/tenant.service';

export class CreateTenantHandler {
  constructor(private readonly tenantService: TenantService) {}

  async execute(command: CreateTenantCommand): Promise<TenantEntity> {
    return this.tenantService.createTenant(command);
  }
}
