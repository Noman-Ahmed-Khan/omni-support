export interface AddCommentCommand {
  tenantId: string;
  ticketId: string;
  authorId: string;
  authorRole: string;
  content: string;
  type: 'PUBLIC' | 'INTERNAL';
}
