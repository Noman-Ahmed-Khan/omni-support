import type { PrismaClient } from '@prisma/client';

import { AttachmentService } from '../../../application/attachment/services/attachment.service';
import { AttachmentPolicyValidator } from '../../../application/attachment/validators/attachment-policy.validator';
import { AttachmentController } from '../../../presentation/http/controllers/attachment.controller';
import type { IStorageProvider } from '../../storage/storage-provider.interface';
import type { Container } from '../index';

export function registerAttachmentModule(container: Container): void {
  const prisma = container.resolve<PrismaClient>('prisma');
  const storageProvider = container.resolve<IStorageProvider>('storageProvider');

  const policyValidator = new AttachmentPolicyValidator();
  container.register('attachmentPolicyValidator', policyValidator);

  const attachmentService = new AttachmentService(
    prisma,
    storageProvider,
    policyValidator,
  );
  container.register('attachmentService', attachmentService);

  const attachmentController = new AttachmentController(attachmentService);
  container.register('attachmentController', attachmentController);
}
