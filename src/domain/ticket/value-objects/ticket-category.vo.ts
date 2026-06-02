export enum TicketCategoryValue {
  GENERAL = 'GENERAL',
  BILLING = 'BILLING',
  TECHNICAL = 'TECHNICAL',
  ACCOUNT = 'ACCOUNT',
  FEATURE_REQUEST = 'FEATURE_REQUEST',
  BUG = 'BUG',
}

export class TicketCategory {
  private constructor(private readonly value: TicketCategoryValue) {}

  static create(value: string): TicketCategory {
    const normalized = value
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_');
    if (!Object.values(TicketCategoryValue).includes(normalized as TicketCategoryValue)) {
      throw new Error(`Invalid ticket category: ${value}`);
    }
    return new TicketCategory(normalized as TicketCategoryValue);
  }

  static general(): TicketCategory {
    return new TicketCategory(TicketCategoryValue.GENERAL);
  }

  toString(): string {
    return this.value;
  }
}
