import { UserEntity } from '../../domain/user/entities/user.entity';

export interface UserResponse {
  id: string;
  tenantId?: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  avatarUrl?: string;
  phone?: string;
  timezone: string;
  locale: string;
  emailVerifiedAt?: Date;
  lastLoginAt?: Date;
  lastLoginIp?: string;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export function mapUserEntityToResponse(user: UserEntity): UserResponse {
  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status,
    avatarUrl: user.avatarUrl,
    phone: user.phone,
    timezone: user.timezone,
    locale: user.locale,
    emailVerifiedAt: user.emailVerifiedAt,
    lastLoginAt: user.lastLoginAt,
    lastLoginIp: user.lastLoginIp,
    failedLoginAttempts: user.failedLoginAttempts,
    lockedUntil: user.lockedUntil,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
