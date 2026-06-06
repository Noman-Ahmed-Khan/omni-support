export const PERMISSION_RESOURCES = {
  TENANTS: 'tenants',
  USERS: 'users',
  CUSTOMERS: 'customers',
  TICKETS: 'tickets',
  COMMENTS: 'comments',
  ANALYTICS: 'analytics',
  REPORTS: 'reports',
  INTEGRATIONS: 'integrations',
  AUDIT: 'audit',
  AI: 'ai',
} as const;

export const PERMISSION_ACTIONS = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  ASSIGN: 'assign',
  ESCALATE: 'escalate',
  EXPORT: 'export',
  SUSPEND: 'suspend',
  RESTORE: 'restore',
  INTERNAL: 'internal',
  TRIGGER: 'trigger',
} as const;

export const permissionKey = (resource: string, action: string): string =>
  `${resource}:${action}`;
