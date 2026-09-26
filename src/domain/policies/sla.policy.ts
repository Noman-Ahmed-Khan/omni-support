import type { TenantEntity } from '../tenant/entities/tenant.entity';

/** Default time to resolution per priority, in hours. */
export const DEFAULT_SLA_HOURS: Readonly<Record<string, number>> = {
  CRITICAL: 4,
  HIGH: 8,
  MEDIUM: 24,
  LOW: 72,
};

/**
 * Computes a ticket's due date from its priority.
 *
 * Organizations can override the defaults with `settings.slaHours`, e.g.
 * `{ "slaHours": { "HIGH": 4 } }`. Invalid override values are ignored.
 */
export class SlaPolicy {
  resolveHours(priority: string, tenant?: Pick<TenantEntity, 'settings'>): number {
    const overrides = tenant?.settings.slaHours;

    if (overrides && typeof overrides === 'object') {
      const value = (overrides as Record<string, unknown>)[priority];
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value;
      }
    }

    return DEFAULT_SLA_HOURS[priority] ?? DEFAULT_SLA_HOURS.MEDIUM;
  }

  computeDueAt(
    priority: string,
    createdAt: Date,
    tenant?: Pick<TenantEntity, 'settings'>,
  ): Date {
    return new Date(
      createdAt.getTime() + this.resolveHours(priority, tenant) * 3_600_000,
    );
  }
}
