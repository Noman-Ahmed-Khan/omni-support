import type { PrismaClient } from '@prisma/client';

import {
  computeEffectivePermissions,
  type Permission,
} from '../../../domain/policies/permission.catalog';
import { ForbiddenError } from '../../../shared/errors/application.error';

export interface PermissionSubject {
  id: string;
  role: string;
  tenantId?: string | null;
}

/**
 * Resolves a user's effective permissions: account class defaults plus the grants of the
 * tenant roles the user is a member of, clipped to the class boundary.
 */
export class PermissionService {
  constructor(private readonly prisma: PrismaClient) {}

  async getEffectivePermissions(subject: PermissionSubject): Promise<Set<Permission>> {
    if (!subject.tenantId) return computeEffectivePermissions(subject.role);

    const memberships = await this.prisma.userRoleMembership.findMany({
      where: { userId: subject.id, tenantId: subject.tenantId },
      select: {
        role: {
          select: {
            permissions: {
              select: { permission: { select: { resource: true, action: true } } },
            },
          },
        },
      },
    });
    const grants = memberships.flatMap((membership) =>
      membership.role.permissions.map(
        ({ permission }) => `${permission.resource}:${permission.action}`,
      ),
    );
    return computeEffectivePermissions(subject.role, grants);
  }

  async has(subject: PermissionSubject, permission: Permission): Promise<boolean> {
    return (await this.getEffectivePermissions(subject)).has(permission);
  }

  async assert(subject: PermissionSubject, permission: Permission): Promise<void> {
    if (!(await this.has(subject, permission))) {
      throw new ForbiddenError(`This action requires the ${permission} permission`);
    }
  }
}
