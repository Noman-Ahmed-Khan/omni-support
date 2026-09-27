-- Reverts 20260928000200_permissions. Route checks must be back on account classes first.
DROP TABLE IF EXISTS "user_role_memberships";
DELETE FROM "role_permissions" WHERE "roleId" IN (SELECT "id" FROM "roles" WHERE "tenantId" IS NULL AND "isSystem" = true);
DELETE FROM "roles" WHERE "tenantId" IS NULL AND "isSystem" = true;
DELETE FROM "permissions" WHERE "id" IN (SELECT md5('permission:' || "resource" || ':' || "action")::uuid::text FROM "permissions");
DROP INDEX IF EXISTS "roles_system_name_key";
ALTER TABLE "roles" DROP CONSTRAINT IF EXISTS "roles_tenantId_fkey";
