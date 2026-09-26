/** The ticket fields that decide who may see it. */
export interface AccessibleTicket {
  assignedAgentId?: string;
  customerId: string;
}

export interface TicketViewer {
  id: string;
  role: string;
  /** For CUSTOMER users: the customer record (same email, same organization), if any. */
  customerId?: string;
}

/**
 * Row-level visibility of tickets inside an organization:
 * - managers see every ticket;
 * - agents see tickets assigned to them;
 * - customers see tickets that belong to their own customer record.
 */
export class TicketAccessPolicy {
  canView(viewer: TicketViewer, ticket: AccessibleTicket): boolean {
    switch (viewer.role) {
      case 'TENANT_MANAGER':
        return true;
      case 'AGENT':
        return ticket.assignedAgentId === viewer.id;
      case 'CUSTOMER':
        return viewer.customerId !== undefined && ticket.customerId === viewer.customerId;
      default:
        return false;
    }
  }
}
