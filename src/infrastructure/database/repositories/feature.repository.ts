import type { Prisma, PrismaClient } from '@prisma/client';

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

  async setTenantFlag(
    tenantId: string,
    feature: string,
    definition: FeatureFlagDefinition,
  ): Promise<void> {
    const currentFlags = await this.getTenantFlags(tenantId);

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: toJsonValue({
          ...(await this.getTenantSettings(tenantId)),
          featureFlags: {
            ...currentFlags,
            [feature]: {
              ...definition,
              updatedAt: new Date().toISOString(),
            },
          },
        }),
      },
    });
  }

  async deleteTenantFlag(tenantId: string, feature: string): Promise<void> {
    const currentFlags = await this.getTenantFlags(tenantId);
    // Preserve the settings object shape while removing only the requested flag.
    delete currentFlags[feature];

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: toJsonValue({
          ...(await this.getTenantSettings(tenantId)),
          featureFlags: currentFlags,
        }),
      },
    });
  }

  private async getTenantSettings(tenantId: string): Promise<Record<string, unknown>> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    return (tenant?.settings as Record<string, unknown>) ?? { featureFlags: {} };
  }
}

function toJsonValue(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
