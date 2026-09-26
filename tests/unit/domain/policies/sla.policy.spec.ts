import { DEFAULT_SLA_HOURS, SlaPolicy } from '../../../../src/domain/policies/sla.policy';

describe('SlaPolicy', () => {
  const policy = new SlaPolicy();
  const createdAt = new Date('2026-01-01T00:00:00Z');

  it('uses the default hours for the priority', () => {
    expect(policy.computeDueAt('HIGH', createdAt).toISOString()).toBe(
      new Date(createdAt.getTime() + DEFAULT_SLA_HOURS.HIGH * 3_600_000).toISOString(),
    );
  });

  it('applies organization overrides', () => {
    const tenant = { settings: { slaHours: { HIGH: 2 } } };
    expect(policy.resolveHours('HIGH', tenant)).toBe(2);
    expect(policy.resolveHours('LOW', tenant)).toBe(DEFAULT_SLA_HOURS.LOW);
  });

  it('ignores invalid overrides and unknown priorities', () => {
    const tenant = { settings: { slaHours: { HIGH: -1, LOW: 'soon' } } };
    expect(policy.resolveHours('HIGH', tenant)).toBe(DEFAULT_SLA_HOURS.HIGH);
    expect(policy.resolveHours('LOW', tenant)).toBe(DEFAULT_SLA_HOURS.LOW);
    expect(policy.resolveHours('UNKNOWN')).toBe(DEFAULT_SLA_HOURS.MEDIUM);
  });
});
