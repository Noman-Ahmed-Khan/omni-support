import type { TenantEntity } from '../tenant/entities/tenant.entity';

export class TenantLimitsPolicy {
  canCreateTicket(tenant: TenantEntity, ticketsCreatedToday: number): boolean {
    return tenant.canCreateTicket() && ticketsCreatedToday < tenant.maxTicketsPerDay;
  }

  canInviteAgent(tenant: TenantEntity, currentAgents: number): boolean {
    return tenant.isActive() && currentAgents < tenant.maxAgents;
  }

  canAddCustomer(tenant: TenantEntity, currentCustomers: number): boolean {
    return tenant.isActive() && currentCustomers < tenant.maxCustomers;
  }
}
