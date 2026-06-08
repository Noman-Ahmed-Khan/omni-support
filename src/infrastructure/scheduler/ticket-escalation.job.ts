import type { TicketService } from '../../application/ticket/services/ticket.service';
import { TicketEscalationPolicy } from '../../domain/policies/ticket-escalation.policy';
import type { ITenantRepository } from '../../domain/tenant/repositories/tenant.repository.interface';
import type { ITicketRepository } from '../../domain/ticket/repositories/ticket.repository.interface';

export function createTicketEscalationJob(
  ticketService: TicketService,
  ticketRepository: ITicketRepository,
  tenantRepository: ITenantRepository,
): () => Promise<void> {
  return async () => {
    const tenants = await tenantRepository.findAll({}, 1, 1000);
    const policy = new TicketEscalationPolicy();

    for (const tenant of tenants.data) {
      const overdueTickets = await ticketRepository.findOverdueTickets(tenant.id);

      for (const ticket of overdueTickets) {
        if (policy.canEscalate(ticket)) {
          await ticketService.escalateTicket({
            tenantId: tenant.id,
            ticketId: ticket.id,
            reason: 'Automated SLA escalation',
            escalatedById: 'system',
            escalatedByRole: 'SYSTEM',
          });
        }
      }
    }
  };
}
