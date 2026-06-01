export interface CategorizeTicketCommand {
  tenantId: string;
  ticketId: string;
  content: string;
  metadata?: Record<string, unknown>;
}
