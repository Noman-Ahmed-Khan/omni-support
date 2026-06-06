import { TicketEntity } from '../ticket/entities/ticket.entity';

export class TicketAssignmentPolicy {
  canAssign(ticket: TicketEntity, assigneeRole: string): boolean {
    return (
      ticket.isActive() &&
      ['AGENT', 'TENANT_MANAGER', 'PLATFORM_ADMIN'].includes(assigneeRole)
    );
  }

  needsReassignmentNotification(previousAgentId?: string): boolean {
    return Boolean(previousAgentId);
  }
}
