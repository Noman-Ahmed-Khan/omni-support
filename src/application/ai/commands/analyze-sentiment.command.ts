export interface AnalyzeSentimentCommand {
  tenantId: string;
  ticketId: string;
  content: string;
  metadata?: Record<string, unknown>;
}
