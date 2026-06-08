import type { PermissionEntity } from './permission.entity';
import { RoleName } from '../value-objects/role-name.vo';

export interface RoleProps {
  id?: string;
  tenantId?: string | null;
  displayName: string;
  description?: string | null;
  isSystem?: boolean;
  permissions?: PermissionEntity[];
  inheritedRoles?: RoleEntity[];
  createdAt?: Date;
  updatedAt?: Date;
}

export class RoleEntity {
  private readonly explicitPermissions: PermissionEntity[];
  private readonly inheritedRoles: RoleEntity[];

  constructor(
    private readonly name: RoleName,
    private readonly props: RoleProps,
  ) {
    this.explicitPermissions = props.permissions ? [...props.permissions] : [];
    this.inheritedRoles = props.inheritedRoles ? [...props.inheritedRoles] : [];
  }

  static create(name: string, props: RoleProps): RoleEntity {
    return new RoleEntity(RoleName.create(name), props);
  }

  assignPermission(permission: PermissionEntity): void {
    if (!this.explicitPermissions.some((existing) => existing.equals(permission))) {
      this.explicitPermissions.push(permission);
    }
  }

  revokePermission(permission: PermissionEntity): void {
    const index = this.explicitPermissions.findIndex((existing) =>
      existing.equals(permission),
    );
    if (index >= 0) {
      this.explicitPermissions.splice(index, 1);
    }
  }

  inheritRole(role: RoleEntity): void {
    if (!this.inheritedRoles.some((existing) => existing.name.equals(role.name))) {
      this.inheritedRoles.push(role);
    }
  }

  hasPermission(permission: PermissionEntity): boolean {
    return this.getEffectivePermissions().some((existing) => existing.equals(permission));
  }

  getEffectivePermissions(): PermissionEntity[] {
    const permissions = new Map<string, PermissionEntity>();

    for (const permission of this.explicitPermissions) {
      permissions.set(permission.toString(), permission);
    }

    for (const inheritedRole of this.inheritedRoles) {
      for (const permission of inheritedRole.getEffectivePermissions()) {
        permissions.set(permission.toString(), permission);
      }
    }

    return [...permissions.values()];
  }

  isTenantScoped(): boolean {
    return this.props.tenantId !== null && this.props.tenantId !== undefined;
  }

  isSystemRole(): boolean {
    return Boolean(this.props.isSystem);
  }

  get id(): string | undefined {
    return this.props.id;
  }

  get tenantId(): string | null | undefined {
    return this.props.tenantId;
  }

  get displayName(): string {
    return this.props.displayName;
  }

  get description(): string | null | undefined {
    return this.props.description;
  }

  get isSystem(): boolean {
    return this.props.isSystem ?? false;
  }

  get permissions(): PermissionEntity[] {
    return [...this.explicitPermissions];
  }

  get inheritedRolesList(): RoleEntity[] {
    return [...this.inheritedRoles];
  }

  get nameValue(): RoleName {
    return this.name;
  }

  get nameAsString(): string {
    return this.name.toString();
  }
}
