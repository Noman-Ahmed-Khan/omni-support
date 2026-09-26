import type { PrismaClient } from '@prisma/client';

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

export class PrismaFeatureFlagRepository implements FeatureFlagRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getTenantFlags(tenantId: string): Promise<Record<string, FeatureFlagDefinition>> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    const flags = (
      tenant?.settings as { featureFlags?: Record<string, FeatureFlagDefinition> } | null
    )?.featureFlags;

    return flags ?? {};
  }

  /**
   * Feature flags are updated in place with jsonb operators, so concurrent writes to
   * other flags or other settings keys are never lost (no read-modify-write).
   */
  async setTenantFlag(
    tenantId: string,
    feature: string,
    definition: FeatureFlagDefinition,
  ): Promise<void> {
    const value = JSON.stringify({ ...definition, updatedAt: new Date().toISOString() });

    await this.prisma.$executeRaw`
      UPDATE "tenants"
      SET "settings" = jsonb_set(
            COALESCE("settings", '{}'::jsonb),
            '{featureFlags}',
            COALESCE("settings"->'featureFlags', '{}'::jsonb)
              || jsonb_build_object(${feature}::text, ${value}::jsonb)
          ),
          "updatedAt" = NOW()
      WHERE "id" = ${tenantId};
    `;
  }

  async deleteTenantFlag(tenantId: string, feature: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "tenants"
      SET "settings" = COALESCE("settings", '{}'::jsonb) #- ARRAY['featureFlags', ${feature}::text],
          "updatedAt" = NOW()
      WHERE "id" = ${tenantId};
    `;
  }
}
