import { PrismaClient } from '@prisma/client';

const PERMISSIONS = [
  // Tenant permissions
  { resource: 'tenants', action: 'create' },
  { resource: 'tenants', action: 'read' },
  { resource: 'tenants', action: 'update' },
  { resource: 'tenants', action: 'delete' },
  { resource: 'tenants', action: 'suspend' },

  // User permissions
  { resource: 'users', action: 'create' },
  { resource: 'users', action: 'read' },
  { resource: 'users', action: 'update' },
  { resource: 'users', action: 'delete' },

  // Customer permissions
  { resource: 'customers', action: 'create' },
  { resource: 'customers', action: 'read' },
  { resource: 'customers', action: 'update' },
  { resource: 'customers', action: 'delete' },
  { resource: 'customers', action: 'export' },

  // Ticket permissions
  { resource: 'tickets', action: 'create' },
  { resource: 'tickets', action: 'read' },
  { resource: 'tickets', action: 'update' },
  { resource: 'tickets', action: 'delete' },
  { resource: 'tickets', action: 'assign' },
  { resource: 'tickets', action: 'escalate' },
  { resource: 'tickets', action: 'export' },

  // Comment permissions
  { resource: 'comments', action: 'create' },
  { resource: 'comments', action: 'read' },
  { resource: 'comments', action: 'update' },
  { resource: 'comments', action: 'delete' },
  { resource: 'comments', action: 'internal' },

  // Analytics permissions
  { resource: 'analytics', action: 'read' },
  { resource: 'reports', action: 'read' },
  { resource: 'reports', action: 'create' },
  { resource: 'reports', action: 'export' },

  // Integration permissions
  { resource: 'integrations', action: 'create' },
  { resource: 'integrations', action: 'read' },
  { resource: 'integrations', action: 'update' },
  { resource: 'integrations', action: 'delete' },

  // Audit permissions
  { resource: 'audit', action: 'read' },

  // AI permissions
  { resource: 'ai', action: 'read' },
  { resource: 'ai', action: 'trigger' },
];

export async function seedPermissions(prisma: PrismaClient) {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: {
        resource_action: {
          resource: permission.resource,
          action: permission.action,
        },
      },
      update: {},
      create: {
        resource: permission.resource,
        action: permission.action,
        description: `${permission.action} on ${permission.resource}`,
      },
    });
  }
}