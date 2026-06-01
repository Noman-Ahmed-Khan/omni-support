import { BaseDomainEvent } from '../../shared/base.event';

export class UserCreatedEvent extends BaseDomainEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly role: string,
  ) {
    super('USER_CREATED');
  }
}
