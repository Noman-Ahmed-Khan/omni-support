import type { TicketCommentEntity } from '../entities/ticket-comment.entity';

export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ICommentRepository {
  findById(id: string, tenantId: string): Promise<TicketCommentEntity | null>;
  findByTicket(
    ticketId: string,
    tenantId: string,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<TicketCommentEntity>>;
  save(comment: TicketCommentEntity): Promise<TicketCommentEntity>;
  update(comment: TicketCommentEntity): Promise<TicketCommentEntity>;
  delete(id: string, tenantId: string): Promise<void>;
  countByTicket(ticketId: string, tenantId: string): Promise<number>;
}
