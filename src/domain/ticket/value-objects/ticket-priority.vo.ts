export enum TicketPriorityEnum {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export class TicketPriority {
  private constructor(private readonly value: TicketPriorityEnum) {}

  static create(value: string): TicketPriority {
    if (!Object.values(TicketPriorityEnum).includes(value as TicketPriorityEnum)) {
      throw new Error(`Invalid ticket priority: ${value}`);
    }
    return new TicketPriority(value as TicketPriorityEnum);
  }

  static medium() { return new TicketPriority(TicketPriorityEnum.MEDIUM); }

  numericValue(): number {
    const map: Record<TicketPriorityEnum, number> = {
      [TicketPriorityEnum.LOW]: 1,
      [TicketPriorityEnum.MEDIUM]: 2,
      [TicketPriorityEnum.HIGH]: 3,
      [TicketPriorityEnum.CRITICAL]: 4,
    };
    return map[this.value];
  }

  isCritical(): boolean { return this.value === TicketPriorityEnum.CRITICAL; }
  isHigh(): boolean { return this.value === TicketPriorityEnum.HIGH; }
  isHigherThan(other: TicketPriority): boolean {
    return this.numericValue() > other.numericValue();
  }

  toString(): string { return this.value; }
  equals(other: TicketPriority): boolean { return this.value === other.value; }
}