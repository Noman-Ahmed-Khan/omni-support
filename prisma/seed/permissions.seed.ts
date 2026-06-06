import { PrismaClient } from '@prisma/client';
import { PERMISSION_ACTIONS, PERMISSION_RESOURCES } from '../../src/shared/constants/permissions.constants';

const PERMISSIONS = [
  // Tenant permissions
  { resource: PERMISSION_RESOURCES.TENANTS, action: PERMISSION_ACTIONS.CREATE },
  { resource: PERMISSION_RESOURCES.TENANTS, action: PERMISSION_ACTIONS.READ },
  { resource: PERMISSION_RESOURCES.TENANTS, action: PERMISSION_ACTIONS.UPDATE },
  { resource: PERMISSION_RESOURCES.TENANTS, action: PERMISSION_ACTIONS.DELETE },
  { resource: PERMISSION_RESOURCES.TENANTS, action: PERMISSION_ACTIONS.SUSPEND },

  // User permissions
  { resource: PERMISSION_RESOURCES.USERS, action: PERMISSION_ACTIONS.CREATE },
  { resource: PERMISSION_RESOURCES.USERS, action: PERMISSION_ACTIONS.READ },
  { resource: PERMISSION_RESOURCES.USERS, action: PERMISSION_ACTIONS.UPDATE },
  { resource: PERMISSION_RESOURCES.USERS, action: PERMISSION_ACTIONS.DELETE },

  // Customer permissions
  { resource: PERMISSION_RESOURCES.CUSTOMERS, action: PERMISSION_ACTIONS.CREATE },
  { resource: PERMISSION_RESOURCES.CUSTOMERS, action: PERMISSION_ACTIONS.READ },
  { resource: PERMISSION_RESOURCES.CUSTOMERS, action: PERMISSION_ACTIONS.UPDATE },
  { resource: PERMISSION_RESOURCES.CUSTOMERS, action: PERMISSION_ACTIONS.DELETE },
  { resource: PERMISSION_RESOURCES.CUSTOMERS, action: PERMISSION_ACTIONS.EXPORT },

  // Ticket permissions
  { resource: PERMISSION_RESOURCES.TICKETS, action: PERMISSION_ACTIONS.CREATE },
  { resource: PERMISSION_RESOURCES.TICKETS, action: PERMISSION_ACTIONS.READ },
  { resource: PERMISSION_RESOURCES.TICKETS, action: PERMISSION_ACTIONS.UPDATE },
  { resource: PERMISSION_RESOURCES.TICKETS, action: PERMISSION_ACTIONS.DELETE },
  { resource: PERMISSION_RESOURCES.TICKETS, action: PERMISSION_ACTIONS.ASSIGN },
  { resource: PERMISSION_RESOURCES.TICKETS, action: PERMISSION_ACTIONS.ESCALATE },
  { resource: PERMISSION_RESOURCES.TICKETS, action: PERMISSION_ACTIONS.EXPORT },

  // Comment permissions
  { resource: PERMISSION_RESOURCES.COMMENTS, action: PERMISSION_ACTIONS.CREATE },
  { resource: PERMISSION_RESOURCES.COMMENTS, action: PERMISSION_ACTIONS.READ },
  { resource: PERMISSION_RESOURCES.COMMENTS, action: PERMISSION_ACTIONS.UPDATE },
  { resource: PERMISSION_RESOURCES.COMMENTS, action: PERMISSION_ACTIONS.DELETE },
  { resource: PERMISSION_RESOURCES.COMMENTS, action: PERMISSION_ACTIONS.INTERNAL },

  // Analytics permissions
  { resource: PERMISSION_RESOURCES.ANALYTICS, action: PERMISSION_ACTIONS.READ },
  { resource: PERMISSION_RESOURCES.REPORTS, action: PERMISSION_ACTIONS.READ },
  { resource: PERMISSION_RESOURCES.REPORTS, action: PERMISSION_ACTIONS.CREATE },
  { resource: PERMISSION_RESOURCES.REPORTS, action: PERMISSION_ACTIONS.EXPORT },

  // Integration permissions
  { resource: PERMISSION_RESOURCES.INTEGRATIONS, action: PERMISSION_ACTIONS.CREATE },
  { resource: PERMISSION_RESOURCES.INTEGRATIONS, action: PERMISSION_ACTIONS.READ },
  { resource: PERMISSION_RESOURCES.INTEGRATIONS, action: PERMISSION_ACTIONS.UPDATE },
  { resource: PERMISSION_RESOURCES.INTEGRATIONS, action: PERMISSION_ACTIONS.DELETE },

  // Audit permissions
  { resource: PERMISSION_RESOURCES.AUDIT, action: PERMISSION_ACTIONS.READ },

  // AI permissions
  { resource: PERMISSION_RESOURCES.AI, action: PERMISSION_ACTIONS.READ },
  { resource: PERMISSION_RESOURCES.AI, action: PERMISSION_ACTIONS.TRIGGER },
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
