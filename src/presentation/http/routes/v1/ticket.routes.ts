import { Router } from 'express';
import { TicketController } from '../../controllers/ticket.controller';
import { validate } from '../../middlewares/validate.middleware';
import { Container } from '../../../../container';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { createTenantMiddleware } from '../../middlewares/tenant.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import { asyncHandler } from '../../utils/async-handler';
import {
  createTicketSchema,
  updateTicketSchema,
  assignTicketSchema,
  changeStatusSchema,
  escalateTicketSchema,
  addCommentSchema,
  listTicketsQuerySchema,
} from '../../dtos/ticket/ticket.dto';

export function createTicketRoutes(container: Container): Router {
  const router = Router();
  const controller: TicketController = container.resolve('ticketController');
  const authMiddleware = createAuthMiddleware(
    container.resolve('tokenService'),
  );
  const tenantMiddleware = createTenantMiddleware(
    container.resolve('prisma'),
  );

  // All ticket routes require auth + tenant
  router.use(authMiddleware, tenantMiddleware);

  // List tickets - all roles
  router.get(
    '/',
    validate(listTicketsQuerySchema, 'query'),
    asyncHandler((req, res, next) => controller.findAll(req, res, next)),
  );

  // Create ticket - managers and agents
  router.post(
    '/',
    requireRole('TENANT_MANAGER', 'AGENT', 'CUSTOMER'),
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
    requireRole('TENANT_MANAGER', 'AGENT'),
    validate(updateTicketSchema),
    asyncHandler((req, res, next) => controller.update(req, res, next)),
  );

  // Assign ticket - managers only
  router.post(
    '/:id/assign',
    requireRole('TENANT_MANAGER'),
    validate(assignTicketSchema),
    asyncHandler((req, res, next) => controller.assign(req, res, next)),
  );

  // Change status
  router.patch(
    '/:id/status',
    requireRole('TENANT_MANAGER', 'AGENT'),
    validate(changeStatusSchema),
    asyncHandler((req, res, next) => controller.changeStatus(req, res, next)),
  );

  // Escalate ticket
  router.post(
    '/:id/escalate',
    requireRole('TENANT_MANAGER', 'AGENT'),
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
    asyncHandler((req, res, next) => controller.getHistory(req, res, next)),
  );

  return router;
}
