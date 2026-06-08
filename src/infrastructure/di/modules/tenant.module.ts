import type { PrismaClient } from '@prisma/client';

import type { IEventBus } from '../../../application/event-bus/event-bus.interface';
import { CreateTenantHandler } from '../../../application/tenant/handlers/create-tenant.handler';
import { GetTenantHandler } from '../../../application/tenant/handlers/get-tenant.handler';
import { ListTenantsHandler } from '../../../application/tenant/handlers/list-tenants.handler';
import { RestoreTenantHandler } from '../../../application/tenant/handlers/restore-tenant.handler';
import { SuspendTenantHandler } from '../../../application/tenant/handlers/suspend-tenant.handler';
import { UpdateTenantHandler } from '../../../application/tenant/handlers/update-tenant.handler';
import { TenantService } from '../../../application/tenant/services/tenant.service';
import { TenantController } from '../../../presentation/http/controllers/tenant.controller';
import type { AuditRepository } from '../../database/repositories/audit.repository';
import { TenantRepository } from '../../database/repositories/tenant.repository';
import type { Container } from '../index';

export function registerTenantModule(container: Container): void {
  const prisma = container.resolve<PrismaClient>('prisma');
  const auditRepo = container.resolve<AuditRepository>('auditRepo');
  const eventBus = container.resolve<IEventBus>('eventBus');

  const tenantRepo = new TenantRepository(prisma);
  container.register('tenantRepo', tenantRepo);

  const tenantService = new TenantService(tenantRepo, auditRepo, eventBus);
  container.register('tenantService', tenantService);

  container.register('createTenantHandler', new CreateTenantHandler(tenantService));
  container.register('updateTenantHandler', new UpdateTenantHandler(tenantService));
  container.register('suspendTenantHandler', new SuspendTenantHandler(tenantService));
  container.register('restoreTenantHandler', new RestoreTenantHandler(tenantService));
  container.register('getTenantHandler', new GetTenantHandler(tenantService));
  container.register('listTenantsHandler', new ListTenantsHandler(tenantService));

  container.register(
    'tenantController',
    new TenantController(
      container.resolve('createTenantHandler'),
      container.resolve('updateTenantHandler'),
      container.resolve('suspendTenantHandler'),
      container.resolve('restoreTenantHandler'),
      container.resolve('getTenantHandler'),
      container.resolve('listTenantsHandler'),
    ),
  );
}
