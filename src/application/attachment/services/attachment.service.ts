import type { Attachment, AttachmentStatus, PrismaClient } from '@prisma/client';

import type { IStorageProvider } from '../../../infrastructure/storage/storage-provider.interface';
import { ForbiddenError } from '../../../shared/errors/application.error';
import { ValidationError, NotFoundError } from '../../../shared/errors/domain.error';
import { logger } from '../../../shared/utils/logger.util';
import type { AttachmentPolicyValidator } from '../validators/attachment-policy.validator';

export interface UploadAttachmentData {
  tenantId: string;
  uploaderId: string;
  filename: string;
  mimeType: string;
  base64Content: string;
  ticketId?: string;
  commentId?: string;
}

export interface AttachmentServiceOptions {
  /** When true, files that were never scanned cannot be downloaded. */
  requireAntivirusScan?: boolean;
}

const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;

export class AttachmentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storageProvider: IStorageProvider,
    private readonly policyValidator: AttachmentPolicyValidator,
    private readonly options: AttachmentServiceOptions = {},
  ) {}

  async uploadAttachment(data: UploadAttachmentData): Promise<Attachment> {
    const ticketId = await this.resolveTicketId(data);
    const buffer = Buffer.from(data.base64Content, 'base64');

    // 1. Validate file (declared type, real content type, size, antivirus)
    const policyResult = await this.policyValidator.validate({
      filename: data.filename,
      mimeType: data.mimeType,
      sizeBytes: buffer.length,
      content: buffer,
    });

    if (!policyResult.allowed) {
      throw new ValidationError('File rejected by security policy', {
        reasons: policyResult.reasons,
      });
    }

    // 2. Upload to storage provider
    const uploadResult = await this.storageProvider.upload(buffer, {
      filename: data.filename,
      mimeType: data.mimeType,
      sizeBytes: buffer.length,
      tenantId: data.tenantId,
      folder: ticketId ? `tickets/${ticketId}` : 'general',
    });

    // 3. Save metadata. Files are only reachable through short-lived signed URLs,
    //    so no public URL is stored. Unscanned files stay PENDING, never CLEAN.
    const status: AttachmentStatus =
      policyResult.antivirus === 'clean' ? 'CLEAN' : 'PENDING';

    return this.prisma.attachment.create({
      data: {
        tenantId: data.tenantId,
        uploadedById: data.uploaderId,
        filename: data.filename,
        originalName: data.filename,
        mimeType: data.mimeType,
        sizeBytes: buffer.length,
        storageProvider: uploadResult.provider === 's3' ? 'S3' : 'LOCAL',
        storagePath: uploadResult.storagePath,
        status,
        ticketId,
        commentId: data.commentId,
      },
    });
  }

  async getAttachment(id: string, tenantId: string): Promise<Attachment> {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id, tenantId },
    });

    if (!attachment) {
      throw new NotFoundError('Attachment');
    }

    return attachment;
  }

  async getDownloadUrl(id: string, tenantId: string): Promise<string> {
    const attachment = await this.getAttachment(id, tenantId);

    if (attachment.status === 'INFECTED' || attachment.status === 'REJECTED') {
      throw new ForbiddenError(
        'This file failed security checks and cannot be downloaded',
      );
    }

    if (attachment.status !== 'CLEAN' && this.options.requireAntivirusScan) {
      throw new ForbiddenError('This file has not been scanned yet');
    }

    return this.storageProvider.getSignedUrl(attachment.storagePath, {
      expiresIn: DOWNLOAD_URL_TTL_SECONDS,
    });
  }

  async deleteAttachment(
    id: string,
    tenantId: string,
    userId: string,
    userRole: string,
  ): Promise<void> {
    const attachment = await this.getAttachment(id, tenantId);

    // Only uploader or high privileged user can delete
    if (
      attachment.uploadedById !== userId &&
      !['PLATFORM_ADMIN', 'TENANT_MANAGER'].includes(userRole)
    ) {
      throw new ForbiddenError('Unauthorized to delete attachment');
    }

    try {
      await this.storageProvider.delete(attachment.storagePath);
    } catch (error) {
      // Still delete the record so the attachment does not stay listed
      logger.warn('Failed to delete attachment file from storage', {
        attachmentId: attachment.id,
        error,
      });
    }

    await this.prisma.attachment.delete({
      where: { id: attachment.id },
    });
  }

  /**
   * The ticket and comment an attachment is linked to must belong to the uploader's
   * organization. A comment implies its ticket.
   */
  private async resolveTicketId(data: UploadAttachmentData): Promise<string | undefined> {
    let ticketId = data.ticketId;

    if (data.commentId) {
      const comment = await this.prisma.ticketComment.findFirst({
        where: { id: data.commentId, tenantId: data.tenantId },
        select: { ticketId: true },
      });

      if (!comment || (ticketId && comment.ticketId !== ticketId)) {
        throw new NotFoundError('Comment', data.commentId);
      }
      ticketId = comment.ticketId;
    }

    if (ticketId) {
      const ticket = await this.prisma.ticket.findFirst({
        where: { id: ticketId, tenantId: data.tenantId },
        select: { id: true },
      });

      if (!ticket) {
        throw new NotFoundError('Ticket', ticketId);
      }
    }

    return ticketId;
  }
}
