import type { PrismaClient, UserRole } from '@prisma/client';

import { PermissionName } from '../../domain/authorization/value-objects/permission-name.vo';
import { RoleName } from '../../domain/authorization/value-objects/role-name.vo';
import { permissionKey } from '../../shared/constants/permissions.constants';
import { ROLE_NAMES } from '../../shared/constants/roles.constants';

export interface CachedPermissions {
  userId: string;
  role: string;
  permissions: string[];
  tenantId?: string | null;
  cachedAt: number;
}

export interface PermissionCache {
  getPermissions(userId: string): Promise<CachedPermissions | null>;
  setPermissions(permissions: CachedPermissions): Promise<void>;
}

export interface AuthorizationContext {
  userId: string;
  tenantId?: string | null;
  role: string;
}

export class AuthorizationService {
  constructor(private readonly prisma: PrismaClient) {}

  async hasPermission(
    context: AuthorizationContext,
    resource: string,
    action: string,
    permissionCache?: PermissionCache,
  ): Promise<boolean> {
    const permission = PermissionName.create(resource, action);
    const cachedPermissionKey = permissionKey(resource, action);

    if (permissionCache) {
      const cached = await permissionCache.getPermissions(context.userId);
      if (cached) {
        return cached.permissions.includes(cachedPermissionKey);
      }
    }

    const effectivePermissions = await this.getEffectivePermissions(context);

    if (permissionCache) {
      await permissionCache.setPermissions({
        userId: context.userId,
        role: context.role,
        tenantId: context.tenantId,
        permissions: [...effectivePermissions],
        cachedAt: Date.now(),
      });
    }

    return (
      effectivePermissions.has(permission.toString()) ||
      effectivePermissions.has(cachedPermissionKey)
    );
  }

  async getEffectivePermissions(context: AuthorizationContext): Promise<Set<string>> {
    const permissions = new Set<string>();
    const roleName = RoleName.create(context.role);

    if (roleName.isPlatformAdmin()) {
      const allPermissions = await this.prisma.permission.findMany();
      for (const permission of allPermissions) {
        permissions.add(permissionKey(permission.resource, permission.action));
      }
      return permissions;
    }

    const systemRoles = await this.loadSystemRolePermissions();
    const rolePermissions = systemRoles.get(roleName.toString());

    if (rolePermissions) {
      for (const permission of rolePermissions) {
        permissions.add(permission);
      }
    }

    if (context.tenantId) {
      const tenantRole = await this.prisma.role.findFirst({
        where: { tenantId: context.tenantId, name: roleName.toString() },
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      });

      if (tenantRole) {
        for (const permission of tenantRole.permissions) {
          permissions.add(
            permissionKey(permission.permission.resource, permission.permission.action),
          );
        }
      }
    }

    return permissions;
  }

  async assignRoleToUser(userId: string, role: UserRole): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { role },
    });
  }

  private async loadSystemRolePermissions(): Promise<Map<string, string[]>> {
    const roles = await this.prisma.role.findMany({
      where: { tenantId: null },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });

    return new Map(
      roles.map((role) => [
        role.name,
        role.permissions.map((entry) =>
          permissionKey(entry.permission.resource, entry.permission.action),
        ),
      ]),
    );
  }
}

export const SYSTEM_PERMISSION_SEEDS = {
  PLATFORM_ADMIN: ROLE_NAMES.PLATFORM_ADMIN,
  TENANT_MANAGER: ROLE_NAMES.TENANT_MANAGER,
  AGENT: ROLE_NAMES.AGENT,
  CUSTOMER: ROLE_NAMES.CUSTOMER,
} as const;
