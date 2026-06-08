import type { PermissionName } from '../value-objects/permission-name.vo';

export interface PermissionProps {
  id?: string;
  description?: string;
  createdAt?: Date;
}

export class PermissionEntity {
  constructor(
    private readonly name: PermissionName,
    private readonly props: PermissionProps = {},
  ) {}

  get id(): string | undefined {
    return this.props.id;
  }

  get resource(): string {
    return this.name.resource;
  }

  get action(): string {
    return this.name.action;
  }

  get description(): string | undefined {
    return this.props.description;
  }

  get createdAt(): Date | undefined {
    return this.props.createdAt;
  }

  toString(): string {
    return this.name.toString();
  }

  equals(other: PermissionEntity): boolean {
    return this.name.equals(other.name);
  }
}
