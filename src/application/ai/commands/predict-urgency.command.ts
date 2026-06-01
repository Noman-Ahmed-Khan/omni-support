export interface PredictUrgencyCommand {
  tenantId: string;
  ticketId: string;
  content: string;
  metadata?: Record<string, unknown>;
}
