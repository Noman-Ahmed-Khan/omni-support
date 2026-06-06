const PERMISSION_SEGMENT_PATTERN = /^[a-z][a-z0-9_.-]*$/;

export class PermissionName {
  private constructor(
    private readonly resourceValue: string,
    private readonly actionValue: string,
  ) {}

  static create(resource: string, action: string): PermissionName {
    const normalizedResource = resource.trim().toLowerCase();
    const normalizedAction = action.trim().toLowerCase();

    if (!PERMISSION_SEGMENT_PATTERN.test(normalizedResource)) {
      throw new Error(`Invalid permission resource: ${resource}`);
    }

    if (!PERMISSION_SEGMENT_PATTERN.test(normalizedAction)) {
      throw new Error(`Invalid permission action: ${action}`);
    }

    return new PermissionName(normalizedResource, normalizedAction);
  }

  get resource(): string {
    return this.resourceValue;
  }

  get action(): string {
    return this.actionValue;
  }

  toString(): string {
    return `${this.resourceValue}:${this.actionValue}`;
  }

  equals(other: PermissionName): boolean {
    return (
      this.resourceValue === other.resourceValue && this.actionValue === other.actionValue
    );
  }
}
