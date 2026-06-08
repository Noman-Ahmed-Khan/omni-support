import type { PrismaClient, Attachment } from '@prisma/client';

import type { IStorageProvider } from '../../../infrastructure/storage/storage-provider.interface';
import { ForbiddenError } from '../../../shared/errors/application.error';
import { ValidationError, NotFoundError } from '../../../shared/errors/domain.error';
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

export class AttachmentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storageProvider: IStorageProvider,
    private readonly policyValidator: AttachmentPolicyValidator,
  ) {}

  async uploadAttachment(data: UploadAttachmentData): Promise<Attachment> {
    const buffer = Buffer.from(data.base64Content, 'base64');

    // 1. Validate file (MIME type, size, virus scan)
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
      folder: data.ticketId ? `tickets/${data.ticketId}` : 'general',
    });

    // 3. Save metadata to DB
    const attachment = await this.prisma.attachment.create({
      data: {
        tenantId: data.tenantId,
        uploadedById: data.uploaderId,
        filename: data.filename,
        originalName: data.filename,
        mimeType: data.mimeType,
        sizeBytes: buffer.length,
        storageProvider: uploadResult.provider === 's3' ? 'S3' : 'LOCAL',
        storagePath: uploadResult.storagePath,
        publicUrl: uploadResult.publicUrl,
        status: 'CLEAN',
        ticketId: data.ticketId,
        commentId: data.commentId,
      },
    });

    return attachment;
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

    // If it has a public URL, return it
    if (attachment.publicUrl) {
      return attachment.publicUrl;
    }

    // Otherwise generate a presigned URL (valid for 1 hour)
    return this.storageProvider.getSignedUrl(attachment.storagePath, { expiresIn: 3600 });
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

    // Delete from storage
    try {
      await this.storageProvider.delete(attachment.storagePath);
    } catch (error) {
      // Log error but proceed to delete record from DB so we don't end up with orphans
    }

    // Delete from DB
    await this.prisma.attachment.delete({
      where: { id: attachment.id },
    });
  }
}
