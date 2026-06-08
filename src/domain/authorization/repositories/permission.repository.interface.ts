import type { PermissionEntity } from '../entities/permission.entity';

export interface PermissionRepository {
  findById(id: string): Promise<PermissionEntity | null>;
  findByResourceAction(
    resource: string,
    action: string,
  ): Promise<PermissionEntity | null>;
  list(): Promise<PermissionEntity[]>;
  save(permission: PermissionEntity): Promise<PermissionEntity>;
}
