import type {
  CommentType as PrismaCommentType,
  PrismaClient,
  Prisma,
  TicketComment,
} from '@prisma/client';

import { TicketCommentEntity } from '../../../domain/ticket/entities/ticket-comment.entity';
import type {
  ICommentRepository,
  PaginationOptions,
  PaginatedResult,
} from '../../../domain/ticket/repositories/comment.repository.interface';

export class CommentRepository implements ICommentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string, tenantId: string): Promise<TicketCommentEntity | null> {
    const comment = await this.prisma.ticketComment.findFirst({
      where: { id, tenantId },
    });

    if (!comment) return null;
    return this.mapToEntity(comment);
  }

  async findByTicket(
    ticketId: string,
    tenantId: string,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<TicketCommentEntity>> {
    const where: Prisma.TicketCommentWhereInput = { ticketId, tenantId };
    const orderBy = buildOrderBy(pagination.sortBy, pagination.sortOrder);

    const skip = (pagination.page - 1) * pagination.limit;

    const [comments, total] = await Promise.all([
      this.prisma.ticketComment.findMany({
        where,
        skip,
        take: pagination.limit,
        orderBy,
      }),
      this.prisma.ticketComment.count({ where }),
    ]);

    return {
      data: comments.map((c) => this.mapToEntity(c)),
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }

  async save(comment: TicketCommentEntity): Promise<TicketCommentEntity> {
    const data: Prisma.TicketCommentCreateInput = {
      id: comment.id,
      content: comment.content,
      type: toCommentType(comment.type),
      isAiDraft: comment.isAiDraft,
      aiDraftId: comment.aiDraftId ?? undefined,
      metadata: toInputJson(comment.metadata),
      tenantId: comment.tenantId,
      ticket: { connect: { id: comment.ticketId } },
      author: { connect: { id: comment.authorId } },
    };

    const saved = await this.prisma.ticketComment.create({ data });
    return this.mapToEntity(saved);
  }

  async update(comment: TicketCommentEntity): Promise<TicketCommentEntity> {
    const data: Prisma.TicketCommentUpdateInput = {
      content: comment.content,
      type: toCommentType(comment.type),
      isAiDraft: comment.isAiDraft,
      aiDraftId: comment.aiDraftId ?? null,
      editedAt: comment.editedAt ?? null,
      metadata: toInputJson(comment.metadata),
    };

    const updated = await this.prisma.ticketComment.update({
      where: { id: comment.id },
      data,
    });
    return this.mapToEntity(updated);
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await this.prisma.ticketComment.deleteMany({
      where: { id, tenantId },
    });
  }

  async countByTicket(ticketId: string, tenantId: string): Promise<number> {
    return this.prisma.ticketComment.count({
      where: { ticketId, tenantId },
    });
  }

  private mapToEntity(model: TicketComment): TicketCommentEntity {
    return TicketCommentEntity.reconstitute(model.id, {
      tenantId: model.tenantId,
      ticketId: model.ticketId,
      authorId: model.authorId,
      content: model.content,
      type: model.type,
      isAiDraft: model.isAiDraft,
      aiDraftId: model.aiDraftId ?? undefined,
      editedAt: model.editedAt ?? undefined,
      metadata: toMetadataRecord(model.metadata),
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    });
  }
}

function buildOrderBy(
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'desc',
): Prisma.TicketCommentOrderByWithRelationInput {
  switch (sortBy) {
    case 'updatedAt':
      return { updatedAt: sortOrder };
    case 'editedAt':
      return { editedAt: sortOrder };
    case 'createdAt':
    default:
      return { createdAt: sortOrder };
  }
}

function toMetadataRecord(value: Prisma.JsonValue): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toCommentType(value: string): PrismaCommentType {
  return value as PrismaCommentType;
}

function toInputJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
