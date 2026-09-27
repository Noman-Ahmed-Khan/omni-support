import fs from 'fs';
import path from 'path';

import {
  ALL_PERMISSIONS,
  CLASS_BOUNDARY,
  DEFAULT_GRANTS,
  PLATFORM_PERMISSIONS,
  computeEffectivePermissions,
  grantsOutsideBoundary,
} from '../../../../src/domain/policies/permission.catalog';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'prisma/migrations/20260928000200_permissions/migration.sql'),
  'utf8',
);

describe('permission catalog', () => {
  it('matches the permissions seeded by the migration', () => {
    const seeded = [...migration.matchAll(/md5\('permission:([a-z-]+:[a-z-]+)'\)/g)].map(
      (match) => match[1],
    );
    expect(seeded.sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it('matches the system role grants backfilled by the migration', () => {
    for (const [accountClass, grants] of Object.entries(DEFAULT_GRANTS)) {
      const line = new RegExp(`WHEN '${accountClass}' THEN ARRAY\\[([^\\]]*)\\]`).exec(
        migration,
      );
      expect(line).not.toBeNull();
      const seeded = [...line![1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
      expect(seeded.sort()).toEqual([...grants].sort());
    }
  });

  it('keeps every default grant inside its class boundary', () => {
    for (const [accountClass, grants] of Object.entries(DEFAULT_GRANTS)) {
      expect(grantsOutsideBoundary(accountClass, grants)).toEqual([]);
    }
  });

  it('never lets a tenant class hold platform permissions', () => {
    for (const accountClass of ['TENANT_MANAGER', 'AGENT', 'CUSTOMER'] as const) {
      for (const permission of PLATFORM_PERMISSIONS) {
        expect(CLASS_BOUNDARY[accountClass]).not.toContain(permission);
      }
      const effective = computeEffectivePermissions(accountClass, PLATFORM_PERMISSIONS);
      for (const permission of PLATFORM_PERMISSIONS) {
        expect(effective.has(permission)).toBe(false);
      }
    }
  });

  it('adds tenant role grants only within the boundary', () => {
    const agent = computeEffectivePermissions('AGENT', [
      'analytics:read',
      'roles:manage',
      'not:real',
    ]);
    expect(agent.has('analytics:read')).toBe(true);
    expect(agent.has('roles:manage')).toBe(false);
    expect(
      computeEffectivePermissions('CUSTOMER', ['customers:read']).has('customers:read'),
    ).toBe(false);
    expect(computeEffectivePermissions('UNKNOWN', ['tickets:create']).size).toBe(0);
  });
});
