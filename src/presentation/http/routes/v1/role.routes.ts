import type { Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';

import type { RoleActor } from '../../../../application/user/services/role-management.service';
import { RoleManagementService } from '../../../../application/user/services/role-management.service';
import type { Container } from '../../../../shared/di/container';
import { successResponse } from '../../dtos/common/response.dto';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { createPermissionGuard } from '../../middlewares/permission.middleware';
import {
  createTenantMiddleware,
  requireTenantContext,
} from '../../middlewares/tenant.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';

const permissionList = z.array(z.string().max(100)).max(100);

const createRoleSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9_-]+$/i, 'Use letters, digits, "-" or "_"'),
  displayName: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  permissions: permissionList,
});

const updateRoleSchema = z
  .object({
    displayName: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    permissions: permissionList.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');

function toActor(req: Request): RoleActor {
  return { id: req.user!.id, role: req.user!.role, tenantId: req.tenantId! };
}

/** Tenant roles, permission catalog and role memberships. */
export function createRoleRoutes(container: Container): Router {
  const router = Router();
  const requirePermission = createPermissionGuard(container.resolve('permissionService'));
  const service = new RoleManagementService(
    container.resolve('prisma'),
    container.resolve('permissionService'),
    container.resolve('auditRepo'),
  );

  router.use(
    createAuthMiddleware(container.resolve('tokenService')),
    createTenantMiddleware(container.resolve('prisma')),
  );

  router.get('/permissions', requirePermission('users:read'), (_req, res) => {
    res.status(200).json(successResponse(service.catalog()));
  });

  router.use(requireTenantContext);

  router.get(
    '/',
    requirePermission('users:read'),
    asyncHandler(async (req, res) => {
      res.status(200).json(successResponse(await service.list(req.tenantId!)));
    }),
  );
  router.post(
    '/',
    requirePermission('roles:manage'),
    validate(createRoleSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(successResponse(await service.create(toActor(req), req.body)));
    }),
  );
  router.get(
    '/:id',
    requirePermission('users:read'),
    asyncHandler(async (req, res) => {
      res
        .status(200)
        .json(successResponse(await service.get(req.params.id, req.tenantId!)));
    }),
  );
  router.patch(
    '/:id',
    requirePermission('roles:manage'),
    validate(updateRoleSchema),
    asyncHandler(async (req, res) => {
      res
        .status(200)
        .json(
          successResponse(await service.update(toActor(req), req.params.id, req.body)),
        );
    }),
  );
  router.delete(
    '/:id',
    requirePermission('roles:manage'),
    asyncHandler(async (req, res) => {
      await service.remove(toActor(req), req.params.id);
      res.status(204).send();
    }),
  );
  router.get(
    '/:id/members',
    requirePermission('users:read'),
    asyncHandler(async (req, res) => {
      res
        .status(200)
        .json(successResponse(await service.listMembers(req.params.id, req.tenantId!)));
    }),
  );
  router.put(
    '/:id/members/:userId',
    requirePermission('roles:manage'),
    asyncHandler(async (req, res) => {
      await service.assign(toActor(req), req.params.id, req.params.userId);
      res.status(204).send();
    }),
  );
  router.delete(
    '/:id/members/:userId',
    requirePermission('roles:manage'),
    asyncHandler(async (req, res) => {
      await service.unassign(toActor(req), req.params.id, req.params.userId);
      res.status(204).send();
    }),
  );

  return router;
}
