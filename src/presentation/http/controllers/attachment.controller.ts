import type { Request, Response, NextFunction } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { z } from 'zod';

import type { AttachmentService } from '../../../application/attachment/services/attachment.service';
import { successResponse } from '../dtos/common/response.dto';

export const uploadAttachmentSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  base64Content: z.string().min(1),
  ticketId: z.string().uuid().optional(),
  commentId: z.string().uuid().optional(),
});

export type UploadAttachmentDto = z.infer<typeof uploadAttachmentSchema>;

export class AttachmentController {
  constructor(private readonly attachmentService: AttachmentService) {}

  async upload(
    req: Request<ParamsDictionary, unknown, UploadAttachmentDto, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const data = req.body;
      const attachment = await this.attachmentService.uploadAttachment({
        tenantId: req.tenantId!,
        uploaderId: req.user!.id,
        filename: data.filename,
        mimeType: data.mimeType,
        base64Content: data.base64Content,
        ticketId: data.ticketId,
        commentId: data.commentId,
      });

      res.status(201).json(
        successResponse({
          id: attachment.id,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          sizeBytes: Number(attachment.sizeBytes),
          publicUrl: attachment.publicUrl,
        }),
      );
    } catch (error) {
      next(error);
    }
  }

  async getDownloadUrl(
    req: Request<ParamsDictionary, unknown, unknown, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const url = await this.attachmentService.getDownloadUrl(
        req.params.id,
        req.tenantId!,
      );
      res.status(200).json(successResponse({ url }));
    } catch (error) {
      next(error);
    }
  }

  async delete(
    req: Request<ParamsDictionary, unknown, unknown, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      await this.attachmentService.deleteAttachment(
        req.params.id,
        req.tenantId!,
        req.user!.id,
        req.user!.role,
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
