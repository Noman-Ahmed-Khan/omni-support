/**
 * Permission catalog. The four system roles remain account classes; each class has a
 * default grant set (what the class could do before permissions existed) and a
 * boundary (the most a tenant role may add on top). Effective permissions are
 *
 *   defaults(class) ∪ (tenant role grants ∩ boundary(class))
 *
 * Keys are `resource:action`. The migration `20260928000200_permissions` seeds the same
 * catalog and system role grants into the roles/permissions tables; the consistency
 * test in tests/unit/domain/policies keeps both in sync.
 */
export const TENANT_PERMISSIONS = [
  'tickets:create',
  'tickets:update',
  'tickets:assign',
  'tickets:escalate',
  'customers:read',
  'customers:write',
  'customers:delete',
  'customers:risk',
  'ai:use',
  'analytics:read',
  'dashboard:read',
  'search:use',
  'reports:create',
  'users:read',
  'users:manage',
  'invitations:manage',
  'roles:manage',
  'integrations:manage',
  'audit:read',
  'tenant:read',
  'realtime:tenant',
] as const;

export const PLATFORM_PERMISSIONS = [
  'platform:tenants',
  'platform:analytics',
  'platform:operations',
  'platform:invitations',
] as const;

export type TenantPermission = (typeof TENANT_PERMISSIONS)[number];
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];
export type Permission = TenantPermission | PlatformPermission;

export const ALL_PERMISSIONS: readonly Permission[] = [
  ...TENANT_PERMISSIONS,
  ...PLATFORM_PERMISSIONS,
];

export type AccountClass = 'PLATFORM_ADMIN' | 'TENANT_MANAGER' | 'AGENT' | 'CUSTOMER';

export const DEFAULT_GRANTS: Record<AccountClass, readonly Permission[]> = {
  PLATFORM_ADMIN: [
    ...PLATFORM_PERMISSIONS,
    'users:read',
    'users:manage',
    'audit:read',
    'tenant:read',
  ],
  TENANT_MANAGER: [...TENANT_PERMISSIONS],
  AGENT: [
    'tickets:create',
    'tickets:update',
    'tickets:escalate',
    'customers:read',
    'customers:write',
    'ai:use',
    'dashboard:read',
    'search:use',
    'reports:create',
    'users:read',
  ],
  CUSTOMER: ['tickets:create'],
};

/** Permissions that only a tenant manager account may ever hold. */
const MANAGER_ONLY: ReadonlySet<Permission> = new Set<Permission>([
  'users:manage',
  'invitations:manage',
  'roles:manage',
  'integrations:manage',
]);

export const CLASS_BOUNDARY: Record<AccountClass, readonly Permission[]> = {
  PLATFORM_ADMIN: DEFAULT_GRANTS.PLATFORM_ADMIN,
  TENANT_MANAGER: [...TENANT_PERMISSIONS],
  AGENT: TENANT_PERMISSIONS.filter((permission) => !MANAGER_ONLY.has(permission)),
  CUSTOMER: DEFAULT_GRANTS.CUSTOMER,
};

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(value);
}

export function isTenantPermission(value: string): value is TenantPermission {
  return (TENANT_PERMISSIONS as readonly string[]).includes(value);
}

function isAccountClass(value: string): value is AccountClass {
  return value in DEFAULT_GRANTS;
}

/** Combines a class's defaults with tenant role grants, clipped to the class boundary. */
export function computeEffectivePermissions(
  accountClass: string,
  tenantGrants: Iterable<string> = [],
): Set<Permission> {
  if (!isAccountClass(accountClass)) return new Set();
  const effective = new Set<Permission>(DEFAULT_GRANTS[accountClass]);
  const boundary = new Set<string>(CLASS_BOUNDARY[accountClass]);
  for (const grant of tenantGrants) {
    if (boundary.has(grant) && isPermission(grant)) effective.add(grant);
  }
  return effective;
}

/** Grants a tenant role would give a class beyond what its boundary allows. */
export function grantsOutsideBoundary(
  accountClass: string,
  grants: Iterable<string>,
): string[] {
  const boundary = new Set<string>(
    isAccountClass(accountClass) ? CLASS_BOUNDARY[accountClass] : [],
  );
  return [...grants].filter((grant) => !boundary.has(grant));
}
