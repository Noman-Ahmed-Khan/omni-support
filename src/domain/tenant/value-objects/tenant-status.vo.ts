export enum TenantStatusEnum {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  TRIAL = 'TRIAL',
  CANCELLED = 'CANCELLED',
}

export class TenantStatus {
  private constructor(private readonly value: TenantStatusEnum) {}

  static create(value: string): TenantStatus {
    if (!Object.values(TenantStatusEnum).includes(value as TenantStatusEnum)) {
      throw new Error(`Invalid tenant status: ${value}`);
    }
    return new TenantStatus(value as TenantStatusEnum);
  }

  static active() {
    return new TenantStatus(TenantStatusEnum.ACTIVE);
  }

  static trial() {
    return new TenantStatus(TenantStatusEnum.TRIAL);
  }

  isActive(): boolean {
    return this.value === TenantStatusEnum.ACTIVE;
  }

  isSuspended(): boolean {
    return this.value === TenantStatusEnum.SUSPENDED;
  }

  isTrial(): boolean {
    return this.value === TenantStatusEnum.TRIAL;
  }

  toString(): string {
    return this.value;
  }

  equals(other: TenantStatus): boolean {
    return this.value === other.value;
  }
}