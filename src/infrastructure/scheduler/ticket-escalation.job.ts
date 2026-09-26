import {
  SYSTEM_ACTOR_ID,
  type TicketService,
} from '../../application/ticket/services/ticket.service';
import { TicketEscalationPolicy } from '../../domain/policies/ticket-escalation.policy';
import type { ITenantRepository } from '../../domain/tenant/repositories/tenant.repository.interface';
import type { ITicketRepository } from '../../domain/ticket/repositories/ticket.repository.interface';
import { logger } from '../../shared/utils/logger.util';

const TENANT_PAGE_SIZE = 200;

export function createTicketEscalationJob(
  ticketService: TicketService,
  ticketRepository: ITicketRepository,
  tenantRepository: ITenantRepository,
): () => Promise<void> {
  return async () => {
    const policy = new TicketEscalationPolicy();
    let failures = 0;

    for (let page = 1; ; page++) {
      const tenants = await tenantRepository.findAll({}, page, TENANT_PAGE_SIZE);

      for (const tenant of tenants.data) {
        try {
          const overdueTickets = await ticketRepository.findOverdueTickets(tenant.id);

          for (const ticket of overdueTickets) {
            // One failing ticket must not stop escalation for everyone else.
            try {
              // Record the breach first so the ticket is not picked up again next run
              // and SLA metrics reflect it even when it is already escalated.
              await ticketRepository.markSlaBreached(ticket.id, tenant.id);

              if (!policy.canEscalate(ticket)) continue;

              await ticketService.escalateTicket({
                tenantId: tenant.id,
                ticketId: ticket.id,
                reason: 'Automated SLA escalation',
                escalatedById: SYSTEM_ACTOR_ID,
                escalatedByRole: 'SYSTEM',
              });
            } catch (error) {
              failures++;
              logger.error('Automated escalation failed for ticket', {
                tenantId: tenant.id,
                ticketId: ticket.id,
                error,
              });
            }
          }
        } catch (error) {
          failures++;
          logger.error('Automated escalation failed for tenant', {
            tenantId: tenant.id,
            error,
          });
        }
      }

      if (page >= tenants.totalPages || tenants.data.length === 0) break;
    }

    if (failures > 0) {
      logger.warn('Ticket escalation job completed with failures', { failures });
    }
  };
}
