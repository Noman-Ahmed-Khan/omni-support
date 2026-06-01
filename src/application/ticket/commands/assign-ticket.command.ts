export interface AssignTicketCommand {
  tenantId: string;
  ticketId: string;
  agentId: string;
  assignedById: string;
  assignedByRole: string;
}
