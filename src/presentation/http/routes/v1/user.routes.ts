import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import type { Container } from '../../../../shared/di/container';
import type { UserController } from '../../controllers/user.controller';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import { createTenantMiddleware } from '../../middlewares/tenant.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';

export function createUserRoutes(container: Container): Router {
  const router = Router();
  const controller = container.resolve<UserController>('userController');

  // Common DTOs
  const updateProfileSchema = z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    avatarUrl: z
      .string()
      .url()
      .refine((value) => /^https?:\/\//i.test(value), {
        message: 'Avatar URL must use http or https',
      })
      .optional()
      .or(z.literal('')),
    phone: z.string().optional(),
    timezone: z.string().optional(),
    locale: z.string().optional(),
  });

  const changeRoleSchema = z.object({
    role: z.enum(['PLATFORM_ADMIN', 'TENANT_MANAGER', 'AGENT', 'CUSTOMER']),
  });

  const prisma = container.resolve<PrismaClient>('prisma');
  const authMiddleware = createAuthMiddleware(container.resolve('tokenService'));
  const selfTenantMiddleware = createTenantMiddleware(prisma, { allowTenantless: true });
  const tenantMiddleware = createTenantMiddleware(prisma);

  // Protect all user routes
  router.use(authMiddleware);

  // Self routes (users without an organization may manage their own profile)
  router.get(
    '/me',
    selfTenantMiddleware,
    asyncHandler((req, res, next) => controller.getMe(req, res, next)),
  );

  router.put(
    '/me',
    selfTenantMiddleware,
    validate(updateProfileSchema),
    asyncHandler((req, res, next) => controller.updateMe(req, res, next)),
  );

  // General routes are always tenant-scoped (platform admins are unscoped by design)
  router.get(
    '/',
    tenantMiddleware,
    requireRole('PLATFORM_ADMIN', 'TENANT_MANAGER', 'AGENT'),
    asyncHandler((req, res, next) => controller.findAll(req, res, next)),
  );

  router.get(
    '/:id',
    tenantMiddleware,
    requireRole('PLATFORM_ADMIN', 'TENANT_MANAGER', 'AGENT'),
    asyncHandler((req, res, next) => controller.findOne(req, res, next)),
  );

  router.put(
    '/:id/role',
    tenantMiddleware,
    requireRole('PLATFORM_ADMIN', 'TENANT_MANAGER'),
    validate(changeRoleSchema),
    asyncHandler((req, res, next) => controller.changeRole(req, res, next)),
  );

  return router;
}
