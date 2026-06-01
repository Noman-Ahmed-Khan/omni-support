export interface SuggestResponseCommand {
  tenantId: string;
  ticketId: string;
  content: string;
  metadata?: Record<string, unknown>;
}
