export enum UserRoleEnum {
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  TENANT_MANAGER = 'TENANT_MANAGER',
  AGENT = 'AGENT',
  CUSTOMER = 'CUSTOMER',
}

export class UserRole {
  private constructor(private readonly value: UserRoleEnum) {}

  static create(value: string): UserRole {
    if (!Object.values(UserRoleEnum).includes(value as UserRoleEnum)) {
      throw new Error(`Invalid user role: ${value}`);
    }
    return new UserRole(value as UserRoleEnum);
  }

  isPlatformAdmin(): boolean {
    return this.value === UserRoleEnum.PLATFORM_ADMIN;
  }

  isTenantManager(): boolean {
    return this.value === UserRoleEnum.TENANT_MANAGER;
  }

  isAgent(): boolean {
    return this.value === UserRoleEnum.AGENT;
  }

  isCustomer(): boolean {
    return this.value === UserRoleEnum.CUSTOMER;
  }

  isTenantScoped(): boolean {
    return !this.isPlatformAdmin();
  }

  toString(): string {
    return this.value;
  }

  equals(other: UserRole): boolean {
    return this.value === other.value;
  }
}