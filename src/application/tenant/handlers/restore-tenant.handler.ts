import type { TenantEntity } from '../../../domain/tenant/entities/tenant.entity';
import type { TenantService } from '../services/tenant.service';

export interface RestoreTenantCommand {
  tenantId: string;
  actorId: string;
  actorRole: string;
}

export class RestoreTenantHandler {
  constructor(private readonly tenantService: TenantService) {}

  async execute(command: RestoreTenantCommand): Promise<TenantEntity> {
    return this.tenantService.restoreTenant(command);
  }
}
