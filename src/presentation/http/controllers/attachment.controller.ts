import type { Request, Response, NextFunction } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { z } from 'zod';

import type { AttachmentService } from '../../../application/attachment/services/attachment.service';
import type { TicketAccessService } from '../../../application/ticket/services/ticket-access.service';
import {
  supportsSignedDownloads,
  type IStorageProvider,
} from '../../../infrastructure/storage/storage-provider.interface';
import { ForbiddenError } from '../../../shared/errors/application.error';
import { NotFoundError } from '../../../shared/errors/domain.error';
import { successResponse } from '../dtos/common/response.dto';

export const uploadAttachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  base64Content: z.string().min(1),
  ticketId: z.string().uuid().optional(),
  commentId: z.string().uuid().optional(),
});

export type UploadAttachmentDto = z.infer<typeof uploadAttachmentSchema>;

export class AttachmentController {
  constructor(
    private readonly attachmentService: AttachmentService,
    private readonly ticketAccess: TicketAccessService,
    private readonly storageProvider: IStorageProvider,
  ) {}

  async upload(
    req: Request<ParamsDictionary, unknown, UploadAttachmentDto, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const data = req.body;

      if (data.ticketId) {
        await this.ticketAccess.assertCanAccess(this.actor(req), data.ticketId);
      }

      const attachment = await this.attachmentService.uploadAttachment({
        tenantId: req.tenantId!,
        uploaderId: req.user!.id,
        filename: data.filename,
        mimeType: data.mimeType,
        base64Content: data.base64Content,
        ticketId: data.ticketId,
        commentId: data.commentId,
      });

      // Covers attachments linked through a comment only.
      if (!data.ticketId && attachment.ticketId) {
        await this.ticketAccess.assertCanAccess(this.actor(req), attachment.ticketId);
      }

      res.status(201).json(
        successResponse({
          id: attachment.id,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          sizeBytes: Number(attachment.sizeBytes),
          status: attachment.status,
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
      await this.assertCanReadAttachment(req);

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
      await this.assertCanReadAttachment(req);

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

  /**
   * Serves a file from local storage. The signed URL issued by getDownloadUrl is the
   * credential, so this route is not behind authentication.
   */
  downloadSignedFile(
    req: Request<
      ParamsDictionary,
      unknown,
      unknown,
      { token?: string; expires?: string }
    >,
    res: Response,
    next: NextFunction,
  ): void {
    try {
      const storagePath = req.params[0];
      const { token, expires } = req.query;

      if (
        !supportsSignedDownloads(this.storageProvider) ||
        !storagePath ||
        typeof token !== 'string' ||
        typeof expires !== 'string' ||
        !this.storageProvider.verifySignedUrl(storagePath, expires, token)
      ) {
        throw new NotFoundError('File');
      }

      const stream = this.storageProvider.openReadStream(storagePath);
      stream.on('error', () => {
        if (!res.headersSent) {
          next(new NotFoundError('File'));
        } else {
          res.destroy();
        }
      });

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Ticket attachments follow ticket visibility; attachments without a ticket are
   * visible to their uploader and managers only.
   */
  private async assertCanReadAttachment(
    req: Pick<Request, 'params' | 'user' | 'tenantId'>,
  ): Promise<void> {
    const attachment = await this.attachmentService.getAttachment(
      req.params.id,
      req.tenantId!,
    );

    if (attachment.ticketId) {
      await this.ticketAccess.assertCanAccess(this.actor(req), attachment.ticketId);
      return;
    }

    if (attachment.uploadedById !== req.user!.id && req.user!.role !== 'TENANT_MANAGER') {
      throw new ForbiddenError('You do not have access to this attachment');
    }
  }

  private actor(req: Pick<Request, 'user' | 'tenantId'>) {
    return {
      id: req.user!.id,
      role: req.user!.role,
      email: req.user!.email,
      tenantId: req.tenantId!,
    };
  }
}
