export interface FeatureFlagDefinition {
  enabled: boolean;
  rolloutPercentage?: number;
  subjectId?: string;
  description?: string;
  updatedAt?: string;
}

export interface FeatureFlagRepository {
  getTenantFlags(tenantId: string): Promise<Record<string, FeatureFlagDefinition>>;
  setTenantFlag(
    tenantId: string,
    feature: string,
    definition: FeatureFlagDefinition,
  ): Promise<void>;
  deleteTenantFlag(tenantId: string, feature: string): Promise<void>;
}
