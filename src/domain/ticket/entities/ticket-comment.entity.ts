import { DomainError } from '../../../shared/errors/domain.error';
import { AggregateRoot } from '../../shared/aggregate-root';
import { CommentAddedEvent } from '../events/comment-added.event';

export enum TicketCommentTypeEnum {
  PUBLIC = 'PUBLIC',
  INTERNAL = 'INTERNAL',
}

export interface TicketCommentProps {
  tenantId: string;
  ticketId: string;
  authorId: string;
  content: string;
  type: TicketCommentTypeEnum | string;
  isAiDraft: boolean;
  aiDraftId?: string;
  editedAt?: Date;
  metadata: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export class TicketCommentEntity extends AggregateRoot {
  private _tenantId: string;
  private _ticketId: string;
  private _authorId: string;
  private _content: string;
  private _type: TicketCommentTypeEnum;
  private _isAiDraft: boolean;
  private _aiDraftId?: string;
  private _editedAt?: Date;
  private _metadata: Record<string, unknown>;

  private constructor(id: string, props: TicketCommentProps) {
    super(id, props.createdAt, props.updatedAt);
    this._tenantId = props.tenantId;
    this._ticketId = props.ticketId;
    this._authorId = props.authorId;
    this._content = props.content;
    this._type =
      TicketCommentTypeEnum[props.type as keyof typeof TicketCommentTypeEnum] ??
      TicketCommentTypeEnum.PUBLIC;
    this._isAiDraft = props.isAiDraft;
    this._aiDraftId = props.aiDraftId;
    this._editedAt = props.editedAt;
    this._metadata = props.metadata;
  }

  static create(id: string, props: TicketCommentProps): TicketCommentEntity {
    const comment = new TicketCommentEntity(id, props);
    comment.addDomainEvent(
      new CommentAddedEvent(
        props.ticketId,
        props.tenantId,
        id,
        props.authorId,
        comment.type,
      ),
    );
    return comment;
  }

  static reconstitute(id: string, props: TicketCommentProps): TicketCommentEntity {
    return new TicketCommentEntity(id, props);
  }

  edit(content: string): void {
    const trimmed = content.trim();

    if (!trimmed) {
      throw new DomainError('Comment content cannot be empty');
    }

    this._content = trimmed;
    this._editedAt = new Date();
  }

  markAsAiDraft(aiDraftId?: string): void {
    this._isAiDraft = true;
    this._aiDraftId = aiDraftId;
  }

  clearAiDraft(): void {
    this._isAiDraft = false;
    this._aiDraftId = undefined;
  }

  get tenantId(): string {
    return this._tenantId;
  }

  get ticketId(): string {
    return this._ticketId;
  }

  get authorId(): string {
    return this._authorId;
  }

  get content(): string {
    return this._content;
  }

  get type(): string {
    return this._type;
  }

  get isAiDraft(): boolean {
    return this._isAiDraft;
  }

  get aiDraftId(): string | undefined {
    return this._aiDraftId;
  }

  get editedAt(): Date | undefined {
    return this._editedAt;
  }

  get metadata(): Record<string, unknown> {
    return { ...this._metadata };
  }
}
