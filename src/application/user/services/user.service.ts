import { RoleAssignmentPolicy } from '../../../domain/policies/role-assignment.policy';
import type { UserEntity } from '../../../domain/user/entities/user.entity';
import type {
  IUserRepository,
  UserFilters,
  PaginationOptions,
  PaginatedResult,
} from '../../../domain/user/repositories/user.repository.interface';
import { UserRole } from '../../../domain/user/value-objects/user-role.vo';
import type { AuditRepository } from '../../../infrastructure/database/repositories/audit.repository';
import { ForbiddenError } from '../../../shared/errors/application.error';
import { NotFoundError } from '../../../shared/errors/domain.error';
import type { IEventBus } from '../../event-bus/event-bus.interface';

export interface UpdateProfileDto {
  userId: string;
  tenantId?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  phone?: string;
  timezone?: string;
  locale?: string;
}

export interface ChangeRoleDto {
  userId: string;
  targetUserId: string;
  tenantId?: string;
  newRole: string;
  actorRole: string;
}

export interface SessionRevoker {
  revokeAllUserTokens(userId: string, reason?: string): Promise<void>;
}

export class UserService {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly auditRepo: AuditRepository,
    private readonly eventBus: IEventBus,
    private readonly sessionRevoker?: SessionRevoker,
    private readonly roleAssignmentPolicy: RoleAssignmentPolicy = new RoleAssignmentPolicy(),
  ) {}

  async getUser(id: string, tenantId?: string): Promise<UserEntity> {
    const user = await this.userRepo.findById(id, tenantId);
    if (!user) throw new NotFoundError('User', id);
    return user;
  }

  async listUsers(
    filters: UserFilters,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<UserEntity>> {
    return this.userRepo.findAll(filters, pagination);
  }

  async updateProfile(dto: UpdateProfileDto): Promise<UserEntity> {
    const user = await this.getUser(dto.userId, dto.tenantId);

    user.updateProfile({
      firstName: dto.firstName,
      lastName: dto.lastName,
      avatarUrl: dto.avatarUrl,
      phone: dto.phone,
      timezone: dto.timezone,
      locale: dto.locale,
    });

    const updated = await this.userRepo.update(user);

    await this.auditRepo.create({
      tenantId: dto.tenantId,
      actorId: dto.userId,
      actorRole: user.role,
      action: 'UPDATE',
      resource: 'users',
      resourceId: user.id,
      newValue: {
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
    });

    await this.eventBus.publishAll(user.pullDomainEvents());

    return updated;
  }

  async changeRole(dto: ChangeRoleDto): Promise<UserEntity> {
    const targetUser = await this.getUser(dto.targetUserId, dto.tenantId);

    const newRoleObj = UserRole.create(dto.newRole);
    const previousRole = targetUser.role;

    const decision = this.roleAssignmentPolicy.evaluate(
      { id: dto.userId, role: dto.actorRole, tenantId: dto.tenantId },
      { id: targetUser.id, role: targetUser.role, tenantId: targetUser.tenantId },
      newRoleObj.toString(),
    );

    if (!decision.allowed) {
      throw new ForbiddenError(decision.reason ?? 'Role change not allowed');
    }

    targetUser.changeRole(newRoleObj, dto.userId, dto.actorRole);

    const updated = await this.userRepo.update(targetUser);

    // Existing sessions carry the old role; force re-authentication.
    if (previousRole !== updated.role) {
      await this.sessionRevoker?.revokeAllUserTokens(targetUser.id, 'ROLE_CHANGED');
    }

    await this.auditRepo.create({
      tenantId: dto.tenantId ?? targetUser.tenantId,
      actorId: dto.userId,
      actorRole: dto.actorRole,
      action: 'ROLE_CHANGE',
      resource: 'users',
      resourceId: targetUser.id,
      oldValue: { role: previousRole },
      newValue: { role: dto.newRole },
    });

    await this.eventBus.publishAll(targetUser.pullDomainEvents());

    return updated;
  }
}
