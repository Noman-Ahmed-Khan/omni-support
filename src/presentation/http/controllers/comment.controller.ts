import type { Request, Response, NextFunction } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';

import type { TicketService } from '../../../application/ticket/services/ticket.service';
import type { EditCommentDto } from '../dtos/comment/comment.dto';
import { successResponse } from '../dtos/common/response.dto';

export class CommentController {
  constructor(private readonly ticketService: TicketService) {}

  async update(
    req: Request<ParamsDictionary, unknown, EditCommentDto, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const updated = await this.ticketService.editComment({
        tenantId: req.tenantId!,
        commentId: req.params.id,
        authorId: req.user!.id,
        content: req.body.content,
      });

      res.status(200).json(
        successResponse({
          id: updated.id,
          content: updated.content,
          editedAt: updated.editedAt,
        }),
      );
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.ticketService.deleteComment({
        tenantId: req.tenantId!,
        commentId: req.params.id,
        authorId: req.user!.id,
        authorRole: req.user!.role,
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
