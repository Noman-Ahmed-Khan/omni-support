export enum CustomerStatusValue {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  BLOCKED = 'BLOCKED',
}

export class CustomerStatus {
  private constructor(private readonly value: CustomerStatusValue) {}

  static create(value: string): CustomerStatus {
    if (!Object.values(CustomerStatusValue).includes(value as CustomerStatusValue)) {
      throw new Error(`Invalid customer status: ${value}`);
    }
    return new CustomerStatus(value as CustomerStatusValue);
  }

  static active(): CustomerStatus {
    return new CustomerStatus(CustomerStatusValue.ACTIVE);
  }

  static blocked(): CustomerStatus {
    return new CustomerStatus(CustomerStatusValue.BLOCKED);
  }

  isBlocked(): boolean {
    return this.value === CustomerStatusValue.BLOCKED;
  }

  toString(): string {
    return this.value;
  }
}
