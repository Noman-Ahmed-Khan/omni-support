export enum TicketStatusEnum {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  PENDING_CUSTOMER = 'PENDING_CUSTOMER',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export class TicketStatus {
  private constructor(private readonly value: TicketStatusEnum) {}

  static create(value: string): TicketStatus {
    if (!Object.values(TicketStatusEnum).includes(value as TicketStatusEnum)) {
      throw new Error(`Invalid ticket status: ${value}`);
    }
    return new TicketStatus(value as TicketStatusEnum);
  }

  static open(): TicketStatus {
    return new TicketStatus(TicketStatusEnum.OPEN);
  }
  static inProgress(): TicketStatus {
    return new TicketStatus(TicketStatusEnum.IN_PROGRESS);
  }
  static resolved(): TicketStatus {
    return new TicketStatus(TicketStatusEnum.RESOLVED);
  }

  canTransitionTo(next: TicketStatus): boolean {
    const transitions: Record<TicketStatusEnum, TicketStatusEnum[]> = {
      [TicketStatusEnum.OPEN]: [TicketStatusEnum.IN_PROGRESS, TicketStatusEnum.CLOSED],
      [TicketStatusEnum.IN_PROGRESS]: [
        TicketStatusEnum.PENDING_CUSTOMER,
        TicketStatusEnum.RESOLVED,
        TicketStatusEnum.OPEN,
      ],
      [TicketStatusEnum.PENDING_CUSTOMER]: [
        TicketStatusEnum.IN_PROGRESS,
        TicketStatusEnum.RESOLVED,
        TicketStatusEnum.CLOSED,
      ],
      [TicketStatusEnum.RESOLVED]: [TicketStatusEnum.CLOSED, TicketStatusEnum.OPEN],
      [TicketStatusEnum.CLOSED]: [],
    };

    return transitions[this.value].includes(next.value);
  }

  isResolved(): boolean {
    return this.value === TicketStatusEnum.RESOLVED;
  }
  isClosed(): boolean {
    return this.value === TicketStatusEnum.CLOSED;
  }
  isOpen(): boolean {
    return this.value === TicketStatusEnum.OPEN;
  }
  isActive(): boolean {
    return [
      TicketStatusEnum.OPEN,
      TicketStatusEnum.IN_PROGRESS,
      TicketStatusEnum.PENDING_CUSTOMER,
    ].includes(this.value);
  }

  toString(): string {
    return this.value;
  }
  equals(other: TicketStatus): boolean {
    return this.value === other.value;
  }
}
