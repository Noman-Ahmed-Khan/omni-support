import { setupTestDatabase } from './test-db';
import { getTestPrisma } from './test-db';
import argon2 from 'argon2';
import crypto from 'crypto';

export default async function globalSetup(): Promise<void> {
  process.env.NODE_ENV = 'test';
  await setupTestDatabase();

  // Seed test data
  const prisma = getTestPrisma();

  // Create test permissions
  const permissions = [
    { resource: 'tickets', action: 'create' },
    { resource: 'tickets', action: 'read' },
    { resource: 'tickets', action: 'update' },
    { resource: 'tickets', action: 'assign' },
    { resource: 'tickets', action: 'escalate' },
    { resource: 'customers', action: 'create' },
    { resource: 'customers', action: 'read' },
    { resource: 'customers', action: 'update' },
    { resource: 'comments', action: 'create' },
    { resource: 'comments', action: 'read' },
    { resource: 'comments', action: 'internal' },
    { resource: 'analytics', action: 'read' },
    { resource: 'users', action: 'create' },
    { resource: 'users', action: 'read' },
  ];

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { resource_action: perm },
      update: {},
      create: perm,
    });
  }

  // Create system roles
  const allPerms = await prisma.permission.findMany();
  const permMap = new Map(allPerms.map((p) => [`${p.resource}:${p.action}`, p.id]));

  // Helper function to find or create system roles
  // This avoids Prisma's null validation issue with composite unique constraints
  const findOrCreateSystemRole = async (name: string, displayName: string) => {
    let role = await prisma.role.findFirst({
      where: { tenantId: null, name },
    });
    if (!role) {
      role = await prisma.role.create({
        data: { name, displayName, isSystem: true, tenantId: null },
      });
    }
    return role;
  };

  const managerRole = await findOrCreateSystemRole('TENANT_MANAGER', 'Tenant Manager');
  const agentRole = await findOrCreateSystemRole('AGENT', 'Agent');

  // Assign permissions to manager role
  const managerPerms = allPerms.map((p) => ({
    roleId: managerRole.id,
    permissionId: p.id,
  }));

  await prisma.rolePermission.createMany({
    data: managerPerms,
    skipDuplicates: true,
  });

  // Agent gets limited permissions
  const agentPermKeys = [
    'tickets:create', 'tickets:read', 'tickets:update',
    'customers:read', 'customers:update',
    'comments:create', 'comments:read',
  ];

  for (const key of agentPermKeys) {
    const permId = permMap.get(key);
    if (permId) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: agentRole.id, permissionId: permId } },
        update: {},
        create: { roleId: agentRole.id, permissionId: permId },
      }).catch(() => {});
    }
  }
}