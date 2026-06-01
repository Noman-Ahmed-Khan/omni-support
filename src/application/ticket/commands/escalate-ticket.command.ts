export interface EscalateTicketCommand {
  tenantId: string;
  ticketId: string;
  reason: string;
  escalatedById: string;
  escalatedByRole: string;
}
