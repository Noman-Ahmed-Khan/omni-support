import { Router } from 'express';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { createTenantMiddleware } from '../../middlewares/tenant.middleware';
import { PrismaClient } from '@prisma/client';
import { Container } from '../../../../container';
import { successResponse, paginatedResponse } from '../../dtos/common/response.dto';
import { asyncHandler } from '../../utils/async-handler';

export function createNotificationRoutes(container: Container): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(container.resolve('tokenService'));
  const tenantMiddleware = createTenantMiddleware(container.resolve('prisma'));
  const prisma: PrismaClient = container.resolve('prisma');

  router.use(authMiddleware, tenantMiddleware);

  // Get user notifications
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 20);
      const skip = (page - 1) * limit;

      const [notifications, total] = await Promise.all([
        prisma.notification.findMany({
          where: {
            tenantId: req.tenantId!,
            userId: req.user!.id,
          },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.notification.count({
          where: {
            tenantId: req.tenantId!,
            userId: req.user!.id,
          },
        }),
      ]);

      res.status(200).json(paginatedResponse(notifications, total, page, limit));
    }),
  );

  // Mark notification as read
  router.patch(
    '/:id/read',
    asyncHandler(async (req, res) => {
      await prisma.notification.updateMany({
        where: {
          id: req.params.id,
          userId: req.user!.id,
          tenantId: req.tenantId!,
        },
        data: { readAt: new Date(), status: 'READ' },
      });

      res.status(200).json(successResponse({ message: 'Marked as read' }));
    }),
  );

  // Mark all as read
  router.patch(
    '/mark-all-read',
    asyncHandler(async (req, res) => {
      await prisma.notification.updateMany({
        where: {
          userId: req.user!.id,
          tenantId: req.tenantId!,
          readAt: null,
        },
        data: { readAt: new Date(), status: 'READ' },
      });

      res
        .status(200)
        .json(successResponse({ message: 'All notifications marked as read' }));
    }),
  );

  return router;
}
