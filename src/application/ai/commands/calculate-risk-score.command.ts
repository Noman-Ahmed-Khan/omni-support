export interface CalculateRiskScoreCommand {
  tenantId: string;
  customerId: string;
  content: string;
  metadata?: Record<string, unknown>;
}
