import { Router } from 'express';

import type { Container } from '../../../../shared/di/container';
import type { TicketController } from '../../controllers/ticket.controller';
import {
  createTicketSchema,
  updateTicketSchema,
  assignTicketSchema,
  changeStatusSchema,
  escalateTicketSchema,
  addCommentSchema,
  listTicketsQuerySchema,
  ticketHistoryQuerySchema,
} from '../../dtos/ticket/ticket.dto';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { createPermissionGuard } from '../../middlewares/permission.middleware';
import {
  createTenantMiddleware,
  requireTenantContext,
} from '../../middlewares/tenant.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';

export function createTicketRoutes(container: Container): Router {
  const router = Router();
  const requirePermission = createPermissionGuard(container.resolve('permissionService'));
  const controller: TicketController = container.resolve('ticketController');
  const authMiddleware = createAuthMiddleware(container.resolve('tokenService'));
  const tenantMiddleware = createTenantMiddleware(container.resolve('prisma'));

  // All ticket routes require auth + an organization context
  router.use(authMiddleware, tenantMiddleware, requireTenantContext);

  // Every /:id route first checks that the caller may see that ticket.
  router.param('id', (req, res, next, id: string) => {
    void controller.authorizeTicket(req, res, next, id);
  });

  // List tickets - all roles
  router.get(
    '/',
    validate(listTicketsQuerySchema, 'query'),
    asyncHandler((req, res, next) => controller.findAll(req, res, next)),
  );

  // Create ticket - managers and agents
  router.post(
    '/',
    requirePermission('tickets:create'),
    validate(createTicketSchema),
    asyncHandler((req, res, next) => controller.create(req, res, next)),
  );

  // Get single ticket
  router.get(
    '/:id',
    asyncHandler((req, res, next) => controller.findOne(req, res, next)),
  );

  // Update ticket - managers and agents
  router.patch(
    '/:id',
    requirePermission('tickets:update'),
    validate(updateTicketSchema),
    asyncHandler((req, res, next) => controller.update(req, res, next)),
  );

  // Assign ticket - managers only
  router.post(
    '/:id/assign',
    requirePermission('tickets:assign'),
    validate(assignTicketSchema),
    asyncHandler((req, res, next) => controller.assign(req, res, next)),
  );

  // Change status
  router.patch(
    '/:id/status',
    requirePermission('tickets:update'),
    validate(changeStatusSchema),
    asyncHandler((req, res, next) => controller.changeStatus(req, res, next)),
  );

  // Escalate ticket
  router.post(
    '/:id/escalate',
    requirePermission('tickets:escalate'),
    validate(escalateTicketSchema),
    asyncHandler((req, res, next) => controller.escalate(req, res, next)),
  );

  // Add comment
  router.post(
    '/:id/comments',
    validate(addCommentSchema),
    asyncHandler((req, res, next) => controller.addComment(req, res, next)),
  );

  // Get ticket history
  router.get(
    '/:id/history',
    validate(ticketHistoryQuerySchema, 'query'),
    asyncHandler((req, res, next) => controller.getHistory(req, res, next)),
  );

  return router;
}
