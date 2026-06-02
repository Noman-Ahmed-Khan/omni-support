export abstract class BaseEntity {
  readonly id: string;
  readonly createdAt: Date;
  updatedAt: Date;

  constructor(id: string, createdAt?: Date, updatedAt?: Date) {
    this.id = id;
    this.createdAt = createdAt ?? new Date();
    this.updatedAt = updatedAt ?? new Date();
  }

  equals(other: BaseEntity): boolean {
    if (!(other instanceof BaseEntity)) return false;
    return this.id === other.id;
  }
}
