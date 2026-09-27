import type { Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';

import type {
  ChannelIntegrationService,
  ChannelProvider,
} from '../../../../application/tenant/services/channel-integration.service';
import type { Container } from '../../../../shared/di/container';
import { ValidationError } from '../../../../shared/errors/domain.error';
import { successResponse } from '../../dtos/common/response.dto';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { createPermissionGuard } from '../../middlewares/permission.middleware';
import {
  createTenantMiddleware,
  requireTenantContext,
} from '../../middlewares/tenant.middleware';
import { asyncHandler } from '../../utils/async-handler';

const providerSchema = z.enum(['whatsapp', 'email']);

const configSchemas = {
  whatsapp: z
    .object({
      phoneNumber: z.string().min(8).max(20),
      displayName: z.string().max(100).optional(),
    })
    .strict(),
  email: z
    .object({
      fromName: z.string().min(1).max(100),
      replyTo: z.string().email().optional(),
    })
    .strict(),
};

function parseProvider(req: Request): ChannelProvider {
  const result = providerSchema.safeParse(req.params.provider);
  if (!result.success) throw new ValidationError('Unsupported channel provider');
  return result.data;
}

function toActor(req: Request): { id: string; tenantId: string } {
  return { id: req.user!.id, tenantId: req.tenantId! };
}

/** Tenant WhatsApp and email channel configuration. */
export function createIntegrationRoutes(container: Container): Router {
  const router = Router();
  const requirePermission = createPermissionGuard(container.resolve('permissionService'));
  const service = container.resolve<ChannelIntegrationService>(
    'channelIntegrationService',
  );

  router.use(
    createAuthMiddleware(container.resolve('tokenService')),
    createTenantMiddleware(container.resolve('prisma')),
    requireTenantContext,
    requirePermission('integrations:manage'),
  );

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      res.status(200).json(successResponse(await service.list(req.tenantId!)));
    }),
  );
  router.get(
    '/:provider',
    asyncHandler(async (req, res) => {
      res
        .status(200)
        .json(successResponse(await service.get(req.tenantId!, parseProvider(req))));
    }),
  );
  router.put(
    '/:provider',
    asyncHandler(async (req, res) => {
      const provider = parseProvider(req);
      const config = configSchemas[provider].parse(req.body);
      res
        .status(200)
        .json(successResponse(await service.configure(toActor(req), provider, config)));
    }),
  );
  router.delete(
    '/:provider',
    asyncHandler(async (req, res) => {
      await service.remove(toActor(req), parseProvider(req));
      res.status(204).send();
    }),
  );
  router.post(
    '/:provider/test',
    asyncHandler(async (req, res) => {
      res
        .status(200)
        .json(successResponse(await service.test(toActor(req), parseProvider(req))));
    }),
  );
  router.post(
    '/:provider/enable',
    asyncHandler(async (req, res) => {
      res
        .status(200)
        .json(
          successResponse(
            await service.setEnabled(toActor(req), parseProvider(req), true),
          ),
        );
    }),
  );
  router.post(
    '/:provider/disable',
    asyncHandler(async (req, res) => {
      res
        .status(200)
        .json(
          successResponse(
            await service.setEnabled(toActor(req), parseProvider(req), false),
          ),
        );
    }),
  );
  router.post(
    '/:provider/rotate-secret',
    asyncHandler(async (req, res) => {
      // The only response that ever carries the secret; it is not stored in clear.
      res.setHeader('Cache-Control', 'no-store');
      res
        .status(200)
        .json(
          successResponse(await service.rotateSecret(toActor(req), parseProvider(req))),
        );
    }),
  );

  return router;
}
