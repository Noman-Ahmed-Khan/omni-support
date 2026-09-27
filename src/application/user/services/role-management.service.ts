import type { PrismaClient } from '@prisma/client';

import {
  ALL_PERMISSIONS,
  CLASS_BOUNDARY,
  DEFAULT_GRANTS,
  grantsOutsideBoundary,
  isTenantPermission,
  type AccountClass,
} from '../../../domain/policies/permission.catalog';
import type { AuditRepository } from '../../../infrastructure/database/repositories/audit.repository';
import { ForbiddenError } from '../../../shared/errors/application.error';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/domain.error';
import type { PermissionService } from '../../auth/services/permission.service';

export interface RoleActor {
  id: string;
  role: string;
  tenantId: string;
}

export interface RoleView {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  memberCount?: number;
}

const SYSTEM_ROLE_NAMES = new Set(Object.keys(DEFAULT_GRANTS));

const roleInclude = {
  permissions: { select: { permission: { select: { resource: true, action: true } } } },
  _count: { select: { memberships: true } },
} as const;

type RoleRecord = {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  isSystem: boolean;
  permissions: Array<{ permission: { resource: string; action: string } }>;
  _count?: { memberships: number };
};

function toView(role: RoleRecord): RoleView {
  return {
    id: role.id,
    name: role.name,
    displayName: role.displayName,
    description: role.description,
    isSystem: role.isSystem,
    permissions: role.permissions
      .map(({ permission }) => `${permission.resource}:${permission.action}`)
      .sort(),
    ...(role._count ? { memberCount: role._count.memberships } : {}),
  };
}

/**
 * Tenant roles: named permission bundles that tenant managers grant on top of a user's
 * account class. System roles (one per class) are read-only. A manager can only grant
 * permissions they hold themselves, never platform permissions, and never more than
 * the member's account class allows.
 */
export class RoleManagementService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly permissions: PermissionService,
    private readonly auditRepo: AuditRepository,
  ) {}

  catalog(): Array<{ key: string; boundary: AccountClass[]; defaults: AccountClass[] }> {
    const classes = Object.keys(DEFAULT_GRANTS) as AccountClass[];
    return ALL_PERMISSIONS.map((key) => ({
      key,
      defaults: classes.filter((c) => DEFAULT_GRANTS[c].includes(key)),
      boundary: classes.filter((c) => CLASS_BOUNDARY[c].includes(key)),
    }));
  }

  async list(tenantId: string): Promise<RoleView[]> {
    const roles = await this.prisma.role.findMany({
      where: { OR: [{ tenantId: null, isSystem: true }, { tenantId }] },
      include: {
        permissions: roleInclude.permissions,
        _count: { select: { memberships: { where: { tenantId } } } },
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return roles.map(toView);
  }

  async get(id: string, tenantId: string): Promise<RoleView> {
    return toView(await this.findVisible(id, tenantId));
  }

  async create(
    actor: RoleActor,
    input: {
      name: string;
      displayName: string;
      description?: string;
      permissions: string[];
    },
  ): Promise<RoleView> {
    if (SYSTEM_ROLE_NAMES.has(input.name.toUpperCase())) {
      throw new ValidationError('Role name is reserved for a system role');
    }
    const permissionIds = await this.resolveGrantable(actor, input.permissions);
    const existing = await this.prisma.role.findFirst({
      where: { tenantId: actor.tenantId, name: input.name },
      select: { id: true },
    });
    if (existing) throw new ConflictError('A role with this name already exists');

    const role = await this.prisma.role.create({
      data: {
        tenantId: actor.tenantId,
        name: input.name,
        displayName: input.displayName,
        description: input.description,
        permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
      },
      include: roleInclude,
    });
    await this.audit(actor, 'CREATE', role.id, { permissions: input.permissions });
    return toView(role);
  }

  async update(
    actor: RoleActor,
    id: string,
    input: { displayName?: string; description?: string; permissions?: string[] },
  ): Promise<RoleView> {
    const role = await this.findMutable(id, actor.tenantId);
    let permissionIds: string[] | undefined;
    if (input.permissions) {
      permissionIds = await this.resolveGrantable(actor, input.permissions);
      await this.assertMembersWithinBoundary(role.id, input.permissions);
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      if (permissionIds) {
        await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
        });
      }
      return tx.role.update({
        where: { id: role.id },
        data: { displayName: input.displayName, description: input.description },
        include: roleInclude,
      });
    });
    await this.audit(actor, 'UPDATE', role.id, {
      before: toView(role).permissions,
      after: input.permissions,
    });
    return toView(updated);
  }

  async remove(actor: RoleActor, id: string): Promise<void> {
    const role = await this.findMutable(id, actor.tenantId);
    await this.prisma.role.delete({ where: { id: role.id } });
    await this.audit(actor, 'DELETE', role.id, { name: role.name });
  }

  async listMembers(id: string, tenantId: string) {
    const role = await this.findVisible(id, tenantId);
    if (role.isSystem) {
      return this.prisma.user.findMany({
        where: { tenantId, role: role.name as AccountClass },
        select: { id: true, email: true, firstName: true, lastName: true, role: true },
        orderBy: { email: 'asc' },
        take: 500,
      });
    }
    const memberships = await this.prisma.userRoleMembership.findMany({
      where: { roleId: role.id, tenantId },
      select: {
        createdAt: true,
        assignedById: true,
        user: {
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((membership) => ({
      ...membership.user,
      assignedAt: membership.createdAt,
      assignedById: membership.assignedById,
    }));
  }

  async listUserRoles(userId: string, tenantId: string): Promise<RoleView[]> {
    const memberships = await this.prisma.userRoleMembership.findMany({
      where: { userId, tenantId },
      select: { role: { include: { permissions: roleInclude.permissions } } },
    });
    return memberships.map((membership) => toView(membership.role));
  }

  async assign(actor: RoleActor, roleId: string, userId: string): Promise<void> {
    if (actor.id === userId) throw new ForbiddenError('You cannot change your own roles');
    const role = await this.findMutable(roleId, actor.tenantId);
    const target = await this.findMember(userId, actor.tenantId);
    const grants = toView(role).permissions;
    const outside = grantsOutsideBoundary(target.role, grants);
    if (outside.length) {
      throw new ValidationError(
        `Role grants permissions a ${target.role} account cannot hold: ${outside.join(', ')}`,
      );
    }
    await this.assertActorHolds(actor, grants);
    await this.prisma.userRoleMembership.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId, tenantId: actor.tenantId, assignedById: actor.id },
      update: {},
    });
    await this.audit(actor, 'ROLE_CHANGE', userId, { granted: role.name });
  }

  async unassign(actor: RoleActor, roleId: string, userId: string): Promise<void> {
    if (actor.id === userId) throw new ForbiddenError('You cannot change your own roles');
    const role = await this.findMutable(roleId, actor.tenantId);
    const deleted = await this.prisma.userRoleMembership.deleteMany({
      where: { userId, roleId: role.id, tenantId: actor.tenantId },
    });
    if (deleted.count === 0) throw new NotFoundError('Role membership', userId);
    await this.audit(actor, 'ROLE_CHANGE', userId, { revoked: role.name });
  }

  private async findVisible(id: string, tenantId: string): Promise<RoleRecord> {
    const role = await this.prisma.role.findFirst({
      where: { id, OR: [{ tenantId: null, isSystem: true }, { tenantId }] },
      include: roleInclude,
    });
    if (!role) throw new NotFoundError('Role', id);
    return role;
  }

  private async findMutable(id: string, tenantId: string): Promise<RoleRecord> {
    const role = await this.findVisible(id, tenantId);
    if (role.isSystem) throw new ForbiddenError('System roles cannot be modified');
    return role;
  }

  private async findMember(userId: string, tenantId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true, role: true, status: true },
    });
    if (!user) throw new NotFoundError('User', userId);
    if (user.status !== 'ACTIVE') throw new ConflictError('User is not active');
    return user;
  }

  /** Validates the grant list and returns permission row ids. */
  private async resolveGrantable(actor: RoleActor, grants: string[]): Promise<string[]> {
    const unique = [...new Set(grants)];
    const invalid = unique.filter((grant) => !isTenantPermission(grant));
    if (invalid.length) {
      throw new ValidationError(`Permissions cannot be granted: ${invalid.join(', ')}`);
    }
    await this.assertActorHolds(actor, unique);
    const rows = await this.prisma.permission.findMany({
      where: {
        OR: unique.map((grant) => {
          const [resource, action] = grant.split(':');
          return { resource, action };
        }),
      },
      select: { id: true },
    });
    if (rows.length !== unique.length) {
      throw new ValidationError('Permission catalog is not initialised');
    }
    return rows.map((row) => row.id);
  }

  private async assertActorHolds(actor: RoleActor, grants: string[]): Promise<void> {
    const held = await this.permissions.getEffectivePermissions(actor);
    const missing = grants.filter((grant) => !held.has(grant as never));
    if (missing.length) {
      throw new ForbiddenError(
        `You cannot grant permissions you do not hold: ${missing.join(', ')}`,
      );
    }
  }

  private async assertMembersWithinBoundary(
    roleId: string,
    grants: string[],
  ): Promise<void> {
    const members = await this.prisma.userRoleMembership.findMany({
      where: { roleId },
      select: { user: { select: { role: true } } },
    });
    const classes = new Set(members.map((member) => member.user.role));
    for (const accountClass of classes) {
      if (grantsOutsideBoundary(accountClass, grants).length) {
        throw new ConflictError(
          `Role has ${accountClass} members that cannot hold these permissions`,
        );
      }
    }
  }

  private audit(
    actor: RoleActor,
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'ROLE_CHANGE',
    resourceId: string,
    detail: Record<string, unknown>,
  ): Promise<unknown> {
    return this.auditRepo.create({
      tenantId: actor.tenantId,
      actorId: actor.id,
      actorRole: actor.role,
      action,
      resource: action === 'ROLE_CHANGE' ? 'users' : 'roles',
      resourceId,
      newValue: detail,
    });
  }
}
