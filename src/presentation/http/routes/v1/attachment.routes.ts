import { Router } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';

import type { Container } from '../../../../shared/di/container';
import type {
  AttachmentController,
  UploadAttachmentDto,
} from '../../controllers/attachment.controller';
import { uploadAttachmentSchema } from '../../controllers/attachment.controller';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import {
  createTenantMiddleware,
  requireTenantContext,
} from '../../middlewares/tenant.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';

export function createAttachmentRoutes(container: Container): Router {
  const router = Router();
  const controller: AttachmentController = container.resolve('attachmentController');
  const authMiddleware = createAuthMiddleware(container.resolve('tokenService'));
  const tenantMiddleware = createTenantMiddleware(container.resolve('prisma'));

  // Signed download links are their own credential (local storage only).
  router.get('/files/*', (req, res, next) =>
    controller.downloadSignedFile(req, res, next),
  );

  router.use(authMiddleware, tenantMiddleware, requireTenantContext);

  router.post(
    '/upload',
    validate(uploadAttachmentSchema),
    asyncHandler<ParamsDictionary, unknown, UploadAttachmentDto, unknown>(
      (req, res, next) => controller.upload(req, res, next),
    ),
  );

  router.get(
    '/:id/download-url',
    asyncHandler<ParamsDictionary, unknown, unknown, unknown>((req, res, next) =>
      controller.getDownloadUrl(req, res, next),
    ),
  );

  router.delete(
    '/:id',
    asyncHandler<ParamsDictionary, unknown, unknown, unknown>((req, res, next) =>
      controller.delete(req, res, next),
    ),
  );

  return router;
}
