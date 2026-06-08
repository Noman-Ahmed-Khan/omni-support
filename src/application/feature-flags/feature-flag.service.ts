import type { FeatureFlag } from './feature.enum';
import type { FeatureFlagDefinition, FeatureFlagRepository } from './feature.repository';
import { sha256 } from '../../shared/utils/crypto.util';

export interface FeatureEvaluationContext {
  tenantId?: string;
  subjectId?: string;
  fallbackEnabled?: boolean;
}

export class FeatureFlagService {
  constructor(private readonly repository: FeatureFlagRepository) {}

  async isEnabled(
    feature: FeatureFlag | string,
    context: FeatureEvaluationContext = {},
  ): Promise<boolean> {
    const globalOverride = this.getGlobalOverride(feature);
    if (typeof globalOverride === 'boolean') {
      return globalOverride;
    }

    if (!context.tenantId) {
      return context.fallbackEnabled ?? false;
    }

    const tenantFlags = await this.repository.getTenantFlags(context.tenantId);
    const definition = tenantFlags[feature];

    if (!definition) {
      return context.fallbackEnabled ?? false;
    }

    return this.evaluateDefinition(feature, definition, context);
  }

  async setTenantFlag(
    tenantId: string,
    feature: FeatureFlag | string,
    definition: FeatureFlagDefinition,
  ): Promise<void> {
    await this.repository.setTenantFlag(tenantId, feature, definition);
  }

  async disableTenantFlag(
    tenantId: string,
    feature: FeatureFlag | string,
  ): Promise<void> {
    await this.repository.deleteTenantFlag(tenantId, feature);
  }

  private evaluateDefinition(
    feature: string,
    definition: FeatureFlagDefinition,
    context: FeatureEvaluationContext,
  ): boolean {
    if (!definition.enabled) {
      return false;
    }

    const rollout = definition.rolloutPercentage;
    if (typeof rollout !== 'number') {
      return true;
    }

    if (rollout >= 100) {
      return true;
    }

    if (rollout <= 0) {
      return false;
    }

    const subject = context.subjectId ?? context.tenantId ?? feature;
    const bucket = this.getRolloutBucket(subject);

    return bucket < rollout;
  }

  private getRolloutBucket(subjectId: string): number {
    const hash = sha256(subjectId).slice(0, 8);
    const bucket = Number.parseInt(hash, 16) % 100;
    return Number.isNaN(bucket) ? 0 : bucket;
  }

  private getGlobalOverride(feature: FeatureFlag | string): boolean | undefined {
    const envKey = `FEATURE_FLAG_${feature
      .toString()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')}`;
    const rawValue = process.env[envKey];

    if (!rawValue) {
      return undefined;
    }

    return ['1', 'true', 'yes', 'on'].includes(rawValue.toLowerCase());
  }
}
