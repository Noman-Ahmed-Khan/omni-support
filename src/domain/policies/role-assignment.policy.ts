import { UserRoleEnum } from '../user/value-objects/user-role.vo';

export interface RoleAssignmentActor {
  id: string;
  role: string;
  tenantId?: string;
}

export interface RoleAssignmentTarget {
  id: string;
  role: string;
  tenantId?: string;
}

export interface RoleAssignmentDecision {
  allowed: boolean;
  reason?: string;
}

const PLATFORM_ADMIN: string = UserRoleEnum.PLATFORM_ADMIN;
const TENANT_MANAGER: string = UserRoleEnum.TENANT_MANAGER;

const TENANT_MANAGER_ASSIGNABLE: ReadonlySet<string> = new Set<string>([
  UserRoleEnum.AGENT,
  UserRoleEnum.CUSTOMER,
]);

/**
 * Decides who may change whose role.
 *
 * - Nobody may change their own role.
 * - PLATFORM_ADMIN is a platform-level role: it can only be granted or revoked by a
 *   platform admin, and only for users that do not belong to a tenant.
 * - A platform admin may assign any tenant role to a tenant user.
 * - A tenant manager may only move AGENT/CUSTOMER users of their own tenant between
 *   AGENT and CUSTOMER. Managers cannot promote or demote managers.
 */
export class RoleAssignmentPolicy {
  evaluate(
    actor: RoleAssignmentActor,
    target: RoleAssignmentTarget,
    newRole: string,
  ): RoleAssignmentDecision {
    if (actor.id === target.id) {
      return { allowed: false, reason: 'You cannot change your own role' };
    }

    const grantsPlatformAdmin = newRole === PLATFORM_ADMIN;
    const targetIsPlatformAdmin = target.role === PLATFORM_ADMIN;

    if (actor.role === PLATFORM_ADMIN) {
      if (grantsPlatformAdmin && target.tenantId) {
        return {
          allowed: false,
          reason: 'Tenant users cannot be granted the PLATFORM_ADMIN role',
        };
      }

      if (!grantsPlatformAdmin && !target.tenantId) {
        return {
          allowed: false,
          reason: 'Users without an organization can only hold the PLATFORM_ADMIN role',
        };
      }

      return { allowed: true };
    }

    if (actor.role === TENANT_MANAGER) {
      if (!actor.tenantId || actor.tenantId !== target.tenantId) {
        return { allowed: false, reason: 'User does not belong to your organization' };
      }

      if (targetIsPlatformAdmin || !TENANT_MANAGER_ASSIGNABLE.has(target.role)) {
        return {
          allowed: false,
          reason: 'Only a platform administrator can change this user role',
        };
      }

      if (!TENANT_MANAGER_ASSIGNABLE.has(newRole)) {
        return {
          allowed: false,
          reason: 'Tenant managers can only assign the AGENT or CUSTOMER roles',
        };
      }

      return { allowed: true };
    }

    return { allowed: false, reason: 'You do not have permission to change user roles' };
  }
}
