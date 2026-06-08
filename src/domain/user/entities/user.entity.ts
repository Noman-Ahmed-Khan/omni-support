import { AggregateRoot } from '../../shared/aggregate-root';
import { UserCreatedEvent } from '../events/user-created.event';
import { UserRoleChangedEvent } from '../events/user-role-changed.event';
import type { Email } from '../value-objects/email.vo';
import type { UserRole } from '../value-objects/user-role.vo';

export enum UserStatusEnum {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
}

export interface UserProps {
  tenantId?: string;
  email: Email;
  passwordHash?: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatusEnum;
  avatarUrl?: string;
  phone?: string;
  timezone: string;
  locale: string;
  emailVerifiedAt?: Date;
  lastLoginAt?: Date;
  lastLoginIp?: string;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export class UserEntity extends AggregateRoot {
  private _tenantId?: string;
  private _email: Email;
  private _passwordHash?: string;
  private _firstName: string;
  private _lastName: string;
  private _role: UserRole;
  private _status: UserStatusEnum;
  private _avatarUrl?: string;
  private _phone?: string;
  private _timezone: string;
  private _locale: string;
  private _emailVerifiedAt?: Date;
  private _lastLoginAt?: Date;
  private _lastLoginIp?: string;
  private _failedLoginAttempts: number;
  private _lockedUntil?: Date;

  private constructor(id: string, props: UserProps) {
    super(id, props.createdAt, props.updatedAt);
    this._tenantId = props.tenantId;
    this._email = props.email;
    this._passwordHash = props.passwordHash;
    this._firstName = props.firstName;
    this._lastName = props.lastName;
    this._role = props.role;
    this._status = props.status;
    this._avatarUrl = props.avatarUrl;
    this._phone = props.phone;
    this._timezone = props.timezone;
    this._locale = props.locale;
    this._emailVerifiedAt = props.emailVerifiedAt;
    this._lastLoginAt = props.lastLoginAt;
    this._lastLoginIp = props.lastLoginIp;
    this._failedLoginAttempts = props.failedLoginAttempts;
    this._lockedUntil = props.lockedUntil;
  }

  static create(id: string, props: UserProps): UserEntity {
    const user = new UserEntity(id, props);
    user.addDomainEvent(
      new UserCreatedEvent(id, props.email.toString(), props.role.toString()),
    );
    return user;
  }

  static reconstitute(id: string, props: UserProps): UserEntity {
    return new UserEntity(id, props);
  }

  verifyEmail(): void {
    if (this._emailVerifiedAt) return;
    this._emailVerifiedAt = new Date();
    this._status = UserStatusEnum.ACTIVE;
  }

  updateProfile(input: {
    firstName?: string;
    lastName?: string;
    avatarUrl?: string | null;
    phone?: string | null;
    timezone?: string;
    locale?: string;
  }): void {
    if (input.firstName !== undefined) {
      this._firstName = input.firstName.trim();
    }

    if (input.lastName !== undefined) {
      this._lastName = input.lastName.trim();
    }

    if (input.avatarUrl !== undefined) {
      this._avatarUrl = input.avatarUrl ?? undefined;
    }

    if (input.phone !== undefined) {
      this._phone = input.phone ?? undefined;
    }

    if (input.timezone !== undefined) {
      this._timezone = input.timezone.trim();
    }

    if (input.locale !== undefined) {
      this._locale = input.locale.trim();
    }
  }

  changeRole(nextRole: UserRole, changedById?: string, changedByRole?: string): void {
    const previousRole = this._role.toString();
    const nextRoleValue = nextRole.toString();

    if (previousRole === nextRoleValue) {
      return;
    }

    this._role = nextRole;

    this.addDomainEvent(
      new UserRoleChangedEvent(
        this.id,
        this._tenantId,
        previousRole,
        nextRoleValue,
        changedById,
        changedByRole,
      ),
    );
  }

  recordLogin(ipAddress: string): void {
    this._lastLoginAt = new Date();
    this._lastLoginIp = ipAddress;
    this._failedLoginAttempts = 0;
    this._lockedUntil = undefined;
  }

  recordFailedLogin(): void {
    this._failedLoginAttempts += 1;

    if (this._failedLoginAttempts >= 5) {
      // Lock for 15 minutes
      this._lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    }
  }

  isLocked(): boolean {
    if (!this._lockedUntil) return false;
    return this._lockedUntil > new Date();
  }

  isActive(): boolean {
    return this._status === UserStatusEnum.ACTIVE;
  }

  isEmailVerified(): boolean {
    return !!this._emailVerifiedAt;
  }

  get fullName(): string {
    return `${this._firstName} ${this._lastName}`;
  }

  // Getters
  get tenantId(): string | undefined {
    return this._tenantId;
  }
  get email(): string {
    return this._email.toString();
  }
  get passwordHash(): string | undefined {
    return this._passwordHash;
  }
  get firstName(): string {
    return this._firstName;
  }
  get lastName(): string {
    return this._lastName;
  }
  get role(): string {
    return this._role.toString();
  }
  get status(): string {
    return this._status;
  }
  get avatarUrl(): string | undefined {
    return this._avatarUrl;
  }
  get phone(): string | undefined {
    return this._phone;
  }
  get timezone(): string {
    return this._timezone;
  }
  get locale(): string {
    return this._locale;
  }
  get emailVerifiedAt(): Date | undefined {
    return this._emailVerifiedAt;
  }
  get lastLoginAt(): Date | undefined {
    return this._lastLoginAt;
  }
  get lastLoginIp(): string | undefined {
    return this._lastLoginIp;
  }
  get failedLoginAttempts(): number {
    return this._failedLoginAttempts;
  }
  get lockedUntil(): Date | undefined {
    return this._lockedUntil;
  }
}
