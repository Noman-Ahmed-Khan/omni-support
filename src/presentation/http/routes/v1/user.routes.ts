import { Router } from 'express';
import { z } from 'zod';

import type { Container } from '../../../../infrastructure/di';
import type { UserController } from '../../controllers/user.controller';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';

export function createUserRoutes(container: Container): Router {
  const router = Router();
  const controller = container.resolve<UserController>('userController');

  // Common DTOs
  const updateProfileSchema = z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    avatarUrl: z.string().url().optional().or(z.literal('')),
    phone: z.string().optional(),
    timezone: z.string().optional(),
    locale: z.string().optional(),
  });

  const changeRoleSchema = z.object({
    role: z.enum(['PLATFORM_ADMIN', 'TENANT_MANAGER', 'AGENT', 'CUSTOMER']),
  });

  const authMiddleware = createAuthMiddleware(container.resolve('tokenService'));

  // Protect all user routes
  router.use(authMiddleware);

  // Self routes
  router.get(
    '/me',
    asyncHandler((req, res, next) => controller.getMe(req, res, next)),
  );

  router.put(
    '/me',
    validate(updateProfileSchema),
    asyncHandler((req, res, next) => controller.updateMe(req, res, next)),
  );

  // General routes
  router.get(
    '/',
    requireRole('PLATFORM_ADMIN', 'TENANT_MANAGER', 'AGENT'),
    asyncHandler((req, res, next) => controller.findAll(req, res, next)),
  );

  router.get(
    '/:id',
    requireRole('PLATFORM_ADMIN', 'TENANT_MANAGER', 'AGENT'),
    asyncHandler((req, res, next) => controller.findOne(req, res, next)),
  );

  router.put(
    '/:id/role',
    requireRole('PLATFORM_ADMIN', 'TENANT_MANAGER'),
    validate(changeRoleSchema),
    asyncHandler((req, res, next) => controller.changeRole(req, res, next)),
  );

  return router;
}
