export interface GenerateSummaryCommand {
  tenantId: string;
  ticketId: string;
  content: string;
  metadata?: Record<string, unknown>;
}
