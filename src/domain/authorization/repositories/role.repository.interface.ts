import type { RoleEntity } from '../entities/role.entity';

export interface RoleRepository {
  findById(id: string, tenantId?: string | null): Promise<RoleEntity | null>;
  findByName(name: string, tenantId?: string | null): Promise<RoleEntity | null>;
  list(tenantId?: string | null): Promise<RoleEntity[]>;
  save(role: RoleEntity): Promise<RoleEntity>;
  delete(id: string): Promise<void>;
}
