import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import type { PermissionService } from '../../../../application/auth/services/permission.service';
import { RoleManagementService } from '../../../../application/user/services/role-management.service';
import { StaffLifecycleService } from '../../../../application/user/services/staff-lifecycle.service';
import type { Container } from '../../../../shared/di/container';
import { NotFoundError } from '../../../../shared/errors/domain.error';
import type { UserController } from '../../controllers/user.controller';
import { successResponse } from '../../dtos/common/response.dto';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import {
  createPermissionGuard,
  resolvePermissions,
} from '../../middlewares/permission.middleware';
import {
  createTenantMiddleware,
  requireTenantContext,
} from '../../middlewares/tenant.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';

export function createUserRoutes(container: Container): Router {
  const router = Router();
  const permissionService = container.resolve<PermissionService>('permissionService');
  const requirePermission = createPermissionGuard(permissionService);
  const roleService = new RoleManagementService(
    container.resolve('prisma'),
    permissionService,
    container.resolve('auditRepo'),
  );
  const controller = container.resolve<UserController>('userController');
  const staffLifecycle = new StaffLifecycleService(
    container.resolve('prisma'),
    container.resolve('tokenService'),
    container.resolve('auditRepo'),
  );

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

  router.get(
    '/me/permissions',
    selfTenantMiddleware,
    asyncHandler(async (req, res) => {
      const permissions = await resolvePermissions(permissionService, req);
      res.status(200).json(successResponse({ permissions: [...permissions].sort() }));
    }),
  );

  // General routes are always tenant-scoped (platform admins are unscoped by design)
  router.get(
    '/',
    tenantMiddleware,
    requirePermission('users:read'),
    asyncHandler((req, res, next) => controller.findAll(req, res, next)),
  );

  router.get(
    '/:id',
    tenantMiddleware,
    requirePermission('users:read'),
    asyncHandler((req, res, next) => controller.findOne(req, res, next)),
  );

  router.get(
    '/:id/permissions',
    tenantMiddleware,
    requireTenantContext,
    requirePermission('users:read'),
    asyncHandler(async (req, res) => {
      const user = await prisma.user.findFirst({
        where: { id: req.params.id, tenantId: req.tenantId! },
        select: { id: true, role: true, tenantId: true },
      });
      if (!user) throw new NotFoundError('User', req.params.id);
      const [permissions, roles] = await Promise.all([
        permissionService.getEffectivePermissions(user),
        roleService.listUserRoles(user.id, req.tenantId!),
      ]);
      res.status(200).json(
        successResponse({
          accountClass: user.role,
          roles,
          permissions: [...permissions].sort(),
        }),
      );
    }),
  );

  router.put(
    '/:id/role',
    tenantMiddleware,
    requirePermission('users:manage'),
    validate(changeRoleSchema),
    asyncHandler((req, res, next) => controller.changeRole(req, res, next)),
  );

  router.post(
    '/:id/disable',
    tenantMiddleware,
    requirePermission('users:manage'),
    asyncHandler(async (req, res) => {
      await staffLifecycle.setActive({
        tenantId: req.tenantId!,
        actorId: req.user!.id,
        userId: req.params.id,
        active: false,
      });
      res.status(204).send();
    }),
  );
  router.post(
    '/:id/reactivate',
    tenantMiddleware,
    requirePermission('users:manage'),
    asyncHandler(async (req, res) => {
      await staffLifecycle.setActive({
        tenantId: req.tenantId!,
        actorId: req.user!.id,
        userId: req.params.id,
        active: true,
      });
      res.status(204).send();
    }),
  );
  router.post(
    '/:id/remove',
    tenantMiddleware,
    requirePermission('users:manage'),
    validate(z.object({ replacementAgentId: z.string().uuid().optional() })),
    asyncHandler(async (req, res) => {
      await staffLifecycle.remove({
        tenantId: req.tenantId!,
        actorId: req.user!.id,
        userId: req.params.id,
        replacementAgentId: req.body.replacementAgentId,
      });
      res.status(204).send();
    }),
  );

  return router;
}
