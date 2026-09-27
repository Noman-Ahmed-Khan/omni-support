-- Tenant roles and permissions. System roles mirror the four account classes and carry
-- the grants each class had before permissions existed, so every existing user keeps
-- equivalent effective permissions when route checks switch to permissions.

ALTER TABLE "roles" ADD CONSTRAINT "roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- NULL tenantIds are distinct in a unique index, so system role names need their own.
CREATE UNIQUE INDEX "roles_system_name_key" ON "roles"("name") WHERE "tenantId" IS NULL;

CREATE TABLE "user_role_memberships" (
  "userId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "assignedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_role_memberships_pkey" PRIMARY KEY ("userId", "roleId")
);

CREATE INDEX "user_role_memberships_tenantId_idx" ON "user_role_memberships"("tenantId");
CREATE INDEX "user_role_memberships_roleId_idx" ON "user_role_memberships"("roleId");
ALTER TABLE "user_role_memberships" ADD CONSTRAINT "user_role_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_role_memberships" ADD CONSTRAINT "user_role_memberships_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_role_memberships" ADD CONSTRAINT "user_role_memberships_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_role_memberships" ADD CONSTRAINT "user_role_memberships_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Permission catalog (keys match src/domain/policies/permission.catalog.ts).
INSERT INTO "permissions" ("id", "resource", "action", "description") VALUES
  (md5('permission:tickets:create')::uuid::text, 'tickets', 'create', 'tickets:create'),
  (md5('permission:tickets:update')::uuid::text, 'tickets', 'update', 'tickets:update'),
  (md5('permission:tickets:assign')::uuid::text, 'tickets', 'assign', 'tickets:assign'),
  (md5('permission:tickets:escalate')::uuid::text, 'tickets', 'escalate', 'tickets:escalate'),
  (md5('permission:customers:read')::uuid::text, 'customers', 'read', 'customers:read'),
  (md5('permission:customers:write')::uuid::text, 'customers', 'write', 'customers:write'),
  (md5('permission:customers:delete')::uuid::text, 'customers', 'delete', 'customers:delete'),
  (md5('permission:customers:risk')::uuid::text, 'customers', 'risk', 'customers:risk'),
  (md5('permission:ai:use')::uuid::text, 'ai', 'use', 'ai:use'),
  (md5('permission:analytics:read')::uuid::text, 'analytics', 'read', 'analytics:read'),
  (md5('permission:dashboard:read')::uuid::text, 'dashboard', 'read', 'dashboard:read'),
  (md5('permission:search:use')::uuid::text, 'search', 'use', 'search:use'),
  (md5('permission:reports:create')::uuid::text, 'reports', 'create', 'reports:create'),
  (md5('permission:users:read')::uuid::text, 'users', 'read', 'users:read'),
  (md5('permission:users:manage')::uuid::text, 'users', 'manage', 'users:manage'),
  (md5('permission:invitations:manage')::uuid::text, 'invitations', 'manage', 'invitations:manage'),
  (md5('permission:roles:manage')::uuid::text, 'roles', 'manage', 'roles:manage'),
  (md5('permission:integrations:manage')::uuid::text, 'integrations', 'manage', 'integrations:manage'),
  (md5('permission:audit:read')::uuid::text, 'audit', 'read', 'audit:read'),
  (md5('permission:tenant:read')::uuid::text, 'tenant', 'read', 'tenant:read'),
  (md5('permission:realtime:tenant')::uuid::text, 'realtime', 'tenant', 'realtime:tenant'),
  (md5('permission:platform:tenants')::uuid::text, 'platform', 'tenants', 'platform:tenants'),
  (md5('permission:platform:analytics')::uuid::text, 'platform', 'analytics', 'platform:analytics'),
  (md5('permission:platform:operations')::uuid::text, 'platform', 'operations', 'platform:operations'),
  (md5('permission:platform:invitations')::uuid::text, 'platform', 'invitations', 'platform:invitations')
ON CONFLICT ("resource", "action") DO NOTHING;

-- System roles (one per account class).
INSERT INTO "roles" ("id", "tenantId", "name", "displayName", "description", "isSystem", "updatedAt") VALUES
  (md5('role:PLATFORM_ADMIN')::uuid::text, NULL, 'PLATFORM_ADMIN', 'Platform administrator', 'System role for the PLATFORM_ADMIN account class', true, CURRENT_TIMESTAMP),
  (md5('role:TENANT_MANAGER')::uuid::text, NULL, 'TENANT_MANAGER', 'Tenant manager', 'System role for the TENANT_MANAGER account class', true, CURRENT_TIMESTAMP),
  (md5('role:AGENT')::uuid::text, NULL, 'AGENT', 'Agent', 'System role for the AGENT account class', true, CURRENT_TIMESTAMP),
  (md5('role:CUSTOMER')::uuid::text, NULL, 'CUSTOMER', 'Customer', 'System role for the CUSTOMER account class', true, CURRENT_TIMESTAMP);

-- Backfill: each system role receives the grants its account class already had.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON (p."resource" || ':' || p."action") = ANY (
  CASE r."name"
    WHEN 'PLATFORM_ADMIN' THEN ARRAY['platform:tenants', 'platform:analytics', 'platform:operations', 'platform:invitations', 'users:read', 'users:manage', 'audit:read', 'tenant:read']
    WHEN 'TENANT_MANAGER' THEN ARRAY['tickets:create', 'tickets:update', 'tickets:assign', 'tickets:escalate', 'customers:read', 'customers:write', 'customers:delete', 'customers:risk', 'ai:use', 'analytics:read', 'dashboard:read', 'search:use', 'reports:create', 'users:read', 'users:manage', 'invitations:manage', 'roles:manage', 'integrations:manage', 'audit:read', 'tenant:read', 'realtime:tenant']
    WHEN 'AGENT' THEN ARRAY['tickets:create', 'tickets:update', 'tickets:escalate', 'customers:read', 'customers:write', 'ai:use', 'dashboard:read', 'search:use', 'reports:create', 'users:read']
    WHEN 'CUSTOMER' THEN ARRAY['tickets:create']
  END
)
WHERE r."tenantId" IS NULL AND r."isSystem" = true
ON CONFLICT DO NOTHING;
