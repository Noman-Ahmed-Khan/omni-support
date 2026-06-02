import { BaseDomainEvent } from '../../shared/base.event';

export class CommentAddedEvent extends BaseDomainEvent {
  constructor(
    public readonly ticketId: string,
    public readonly tenantId: string,
    public readonly commentId: string,
    public readonly authorId: string,
    public readonly commentType: string,
  ) {
    super('COMMENT_ADDED');
  }
}
