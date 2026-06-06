import { ROLE_NAMES } from '../../../shared/constants/roles.constants';

const ROLE_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export class RoleName {
  private constructor(private readonly value: string) {}

  static create(input: string): RoleName {
    const normalized = input.trim().toUpperCase();

    if (!ROLE_NAME_PATTERN.test(normalized)) {
      throw new Error(`Invalid role name: ${input}`);
    }

    return new RoleName(normalized);
  }

  isPlatformAdmin(): boolean {
    return this.value === ROLE_NAMES.PLATFORM_ADMIN;
  }

  isTenantManager(): boolean {
    return this.value === ROLE_NAMES.TENANT_MANAGER;
  }

  isAgent(): boolean {
    return this.value === ROLE_NAMES.AGENT;
  }

  isCustomer(): boolean {
    return this.value === ROLE_NAMES.CUSTOMER;
  }

  isSystemRole(): boolean {
    return (
      this.isPlatformAdmin() ||
      this.isTenantManager() ||
      this.isAgent() ||
      this.isCustomer()
    );
  }

  toString(): string {
    return this.value;
  }

  equals(other: RoleName): boolean {
    return this.value === other.value;
  }
}
