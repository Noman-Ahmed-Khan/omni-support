import { Router } from 'express';
import { z } from 'zod';

import { InvitationService } from '../../../../application/auth/services/invitation.service';
import type { Container } from '../../../../shared/di/container';
import { successResponse } from '../../dtos/common/response.dto';
import {
  createAuthMiddleware,
  createOptionalAuthMiddleware,
} from '../../middlewares/auth.middleware';
import { createPermissionGuard } from '../../middlewares/permission.middleware';
import {
  createTenantMiddleware,
  requireTenantContext,
} from '../../middlewares/tenant.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['CUSTOMER', 'AGENT']),
  customerId: z.string().uuid().optional(),
});

const acceptSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128).optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
});

export function createInvitationRoutes(container: Container): Router {
  const router = Router();
  const requirePermission = createPermissionGuard(container.resolve('permissionService'));
  const service = new InvitationService(
    container.resolve('prisma'),
    container.resolve('emailQueue'),
    container.resolve('auditRepo'),
  );

  router.post(
    '/accept',
    createOptionalAuthMiddleware(container.resolve('tokenService')),
    validate(acceptSchema),
    asyncHandler(async (req, res) => {
      await service.accept({ ...req.body, authenticatedUserId: req.user?.id });
      res.status(204).send();
    }),
  );

  router.post(
    '/platform',
    createAuthMiddleware(container.resolve('tokenService')),
    requirePermission('platform:invitations'),
    validate(
      z.object({
        tenantId: z.string().uuid(),
        email: z.string().email(),
        role: z.enum(['TENANT_MANAGER', 'AGENT']),
      }),
    ),
    asyncHandler(async (req, res) => {
      const result = await service.create({
        tenantId: req.body.tenantId,
        email: req.body.email,
        role: req.body.role,
        actorId: req.user!.id,
      });
      res.status(201).json(successResponse(result));
    }),
  );

  router.use(
    createAuthMiddleware(container.resolve('tokenService')),
    createTenantMiddleware(container.resolve('prisma')),
    requireTenantContext,
    requirePermission('invitations:manage'),
  );

  router.post(
    '/',
    validate(inviteSchema),
    asyncHandler(async (req, res) => {
      const result = await service.create({
        ...req.body,
        tenantId: req.tenantId!,
        actorId: req.user!.id,
      });
      res.status(201).json(successResponse(result));
    }),
  );
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      res.status(200).json(successResponse(await service.list(req.tenantId!)));
    }),
  );
  router.post(
    '/:id/resend',
    asyncHandler(async (req, res) => {
      await service.resend(req.params.id, req.tenantId!, req.user!.id);
      res.status(204).send();
    }),
  );
  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      await service.revoke(req.params.id, req.tenantId!, req.user!.id);
      res.status(204).send();
    }),
  );
  return router;
}
