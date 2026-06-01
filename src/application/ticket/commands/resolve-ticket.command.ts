export interface ResolveTicketCommand {
  tenantId: string;
  ticketId: string;
  resolvedById: string;
  resolvedByRole: string;
}
