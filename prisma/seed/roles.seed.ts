import { PrismaClient } from '@prisma/client';
import { ROLE_NAMES } from '../../src/shared/constants/roles.constants';
import { permissionKey } from '../../src/shared/constants/permissions.constants';

export async function seedRoles(prisma: PrismaClient) {
  const allPermissions = await prisma.permission.findMany();

  const permissionMap = new Map(
    allPermissions.map((p) => [permissionKey(p.resource, p.action), p.id]),
  );

  const getPermissionIds = (keys: string[]) =>
    keys
      .map((key) => permissionMap.get(key))
      .filter(Boolean) as string[];

  // Platform Admin - all permissions
  await upsertRole(prisma, {
    name: ROLE_NAMES.PLATFORM_ADMIN,
    displayName: 'Platform Administrator',
    isSystem: true,
    permissionIds: allPermissions.map((p) => p.id),
  });

  // Tenant Manager
  await upsertRole(prisma, {
    name: ROLE_NAMES.TENANT_MANAGER,
    displayName: 'Tenant Manager',
    isSystem: true,
    permissionIds: getPermissionIds([
      'users:create', 'users:read', 'users:update', 'users:delete',
      'customers:create', 'customers:read', 'customers:update',
      'customers:delete', 'customers:export',
      'tickets:create', 'tickets:read', 'tickets:update',
      'tickets:delete', 'tickets:assign', 'tickets:escalate', 'tickets:export',
      'comments:create', 'comments:read', 'comments:update',
      'comments:delete', 'comments:internal',
      'analytics:read', 'reports:read', 'reports:create', 'reports:export',
      'integrations:create', 'integrations:read',
      'integrations:update', 'integrations:delete',
      'audit:read', 'ai:read', 'ai:trigger',
    ]),
  });

  // Agent
  await upsertRole(prisma, {
    name: ROLE_NAMES.AGENT,
    displayName: 'Support Agent',
    isSystem: true,
    permissionIds: getPermissionIds([
      'customers:read', 'customers:update',
      'tickets:read', 'tickets:update', 'tickets:assign',
      'comments:create', 'comments:read', 'comments:internal',
      'ai:read',
    ]),
  });

  // Customer
  await upsertRole(prisma, {
    name: ROLE_NAMES.CUSTOMER,
    displayName: 'Customer',
    isSystem: true,
    permissionIds: getPermissionIds([
      'tickets:create', 'tickets:read',
      'comments:create', 'comments:read',
    ]),
  });
}

async function upsertRole(
  prisma: PrismaClient,
  data: {
    name: string;
    displayName: string;
    isSystem: boolean;
    permissionIds: string[];
  }
) {
  const role = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: null as any, name: data.name } },
    update: { displayName: data.displayName },
    create: {
      name: data.name,
      displayName: data.displayName,
      isSystem: data.isSystem,
    },
  });

  // Clear existing permissions
  await prisma.rolePermission.deleteMany({
    where: { roleId: role.id },
  });

  // Re-create permissions
  if (data.permissionIds.length > 0) {
    await prisma.rolePermission.createMany({
      data: data.permissionIds.map((permissionId) => ({
        roleId: role.id,
        permissionId,
      })),
      skipDuplicates: true,
    });
  }

  return role;
}
