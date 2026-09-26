import type { PrismaClient } from '@prisma/client';

import type { Container } from '..';
import { AttachmentService } from '../../../application/attachment/services/attachment.service';
import { AttachmentPolicyValidator } from '../../../application/attachment/validators/attachment-policy.validator';
import type { TicketAccessService } from '../../../application/ticket/services/ticket-access.service';
import { getStorageConfig } from '../../../config/storage.config';
import type { IStorageProvider } from '../../../infrastructure/storage/storage-provider.interface';
import { AttachmentController } from '../../../presentation/http/controllers/attachment.controller';

export function registerAttachmentModule(container: Container): void {
  const prisma = container.resolve<PrismaClient>('prisma');
  const storageProvider = container.resolve<IStorageProvider>('storageProvider');
  const { requireAntivirusScan } = getStorageConfig();

  const policyValidator = new AttachmentPolicyValidator({ requireAntivirusScan });
  container.register('attachmentPolicyValidator', policyValidator);

  const attachmentService = new AttachmentService(
    prisma,
    storageProvider,
    policyValidator,
    {
      requireAntivirusScan,
    },
  );
  container.register('attachmentService', attachmentService);

  const attachmentController = new AttachmentController(
    attachmentService,
    container.resolve<TicketAccessService>('ticketAccessService'),
    storageProvider,
  );
  container.register('attachmentController', attachmentController);
}
