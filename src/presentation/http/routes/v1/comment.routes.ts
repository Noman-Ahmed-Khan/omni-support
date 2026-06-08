import { Router } from 'express';
import { z } from 'zod';

import type { Container } from '../../../../infrastructure/di';
import type { CommentController } from '../../controllers/comment.controller';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';

export function createCommentRoutes(container: Container): Router {
  const router = Router();
  const controller: CommentController = container.resolve('commentController');
  const authMiddleware = createAuthMiddleware(container.resolve('tokenService'));

  const editCommentSchema = z.object({
    content: z.string().min(1),
  });

  router.use(authMiddleware);

  router.put(
    '/:id',
    validate(editCommentSchema),
    asyncHandler((req, res, next) => controller.update(req, res, next)),
  );

  router.delete(
    '/:id',
    asyncHandler((req, res, next) => controller.delete(req, res, next)),
  );

  return router;
}
