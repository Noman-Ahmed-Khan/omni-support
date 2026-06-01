export interface CloseTicketCommand {
  tenantId: string;
  ticketId: string;
  closedById: string;
  closedByRole: string;
}
