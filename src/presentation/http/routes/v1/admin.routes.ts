import type { PrismaClient, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';

import { operationalSettingsSchema } from '../../../../application/admin/services/operational-settings.service';
import type {
  OperatorActor,
  PlatformOperationsService,
} from '../../../../application/admin/services/platform-operations.service';
import { ProviderStatusService } from '../../../../application/admin/services/provider-status.service';
import type { ChannelIntegrationService } from '../../../../application/tenant/services/channel-integration.service';
import type { AuditRepository } from '../../../../infrastructure/database/repositories/audit.repository';
import { isWhatsAppConfigured } from '../../../../infrastructure/messaging/whatsapp/twilio-whatsapp.provider';
import type { Container } from '../../../../shared/di/container';
import { NotFoundError } from '../../../../shared/errors/domain.error';
import { redactSecrets } from '../../../../shared/utils/redact.util';
import { successResponse } from '../../dtos/common/response.dto';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { createPermissionGuard } from '../../middlewares/permission.middleware';
import { createTenantMiddleware } from '../../middlewares/tenant.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';

const AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'LOGIN',
  'LOGOUT',
  'EXPORT',
  'SUSPEND',
  'RESTORE',
  'ESCALATE',
  'ASSIGN',
  'ROLE_CHANGE',
  'VIEW',
] as const;

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

const auditQuerySchema = z.object({
  ...pagination,
  resource: z.string().max(100).optional(),
  resourceId: z.string().max(100).optional(),
  actorId: z.string().uuid().optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  tenantId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const recordQuerySchema = z.object({
  ...pagination,
  status: z.string().max(30).optional(),
  eventType: z.string().max(100).optional(),
  tenantId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/** Interventions must say why; the reason is kept with the audit record. */
const interventionSchema = z.object({ reason: z.string().trim().min(10).max(1000) });

const settingsUpdateSchema = operationalSettingsSchema
  .partial()
  .extend({ reason: z.string().trim().min(10).max(1000) })
  .refine((value) => Object.keys(value).length > 1, 'No settings to change');

const interventionQuerySchema = z.object({
  targetType: z.enum(['outbox', 'webhook', 'settings']).optional(),
  targetId: z.string().max(100).optional(),
});

function toOperator(req: Pick<Request, 'user'>): OperatorActor {
  return { id: req.user!.id, role: req.user!.role };
}

/**
 * Administration: audit logs for tenant managers and platform admins; platform-admin
 * only operations (outbox/webhook records, processing settings, provider status and
 * integration records across tenants). Platform views are audited.
 */
export function createAdminRoutes(container: Container): Router {
  const router = Router();
  const requirePermission = createPermissionGuard(container.resolve('permissionService'));
  const prisma = container.resolve<PrismaClient>('prisma');
  const auditRepo = container.resolve<AuditRepository>('auditRepo');
  const operations = container.resolve<PlatformOperationsService>(
    'platformOperationsService',
  );
  const channels = container.resolve<ChannelIntegrationService>(
    'channelIntegrationService',
  );
  const providers = new ProviderStatusService(
    container.resolve('storageProvider'),
    container.resolve('emailProvider'),
    isWhatsAppConfigured,
  );

  const auditView = (req: Request, resource: string, resourceId?: string) =>
    auditRepo.create({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'VIEW',
      resource,
      resourceId,
      correlationId: req.correlationId,
    });

  router.use(
    createAuthMiddleware(container.resolve('tokenService')),
    createTenantMiddleware(prisma),
  );

  router.get(
    '/audit',
    requirePermission('audit:read'),
    asyncHandler(async (req, res) => {
      const query = auditQuerySchema.parse(req.query);
      const isPlatform = req.user!.role === 'PLATFORM_ADMIN';
      const where: Prisma.AuditLogWhereInput = {
        // Tenant users only ever see their own organization's records.
        ...(isPlatform
          ? query.tenantId
            ? { tenantId: query.tenantId }
            : {}
          : { tenantId: req.tenantId! }),
        ...(query.resource ? { resource: query.resource } : {}),
        ...(query.resourceId ? { resourceId: query.resourceId } : {}),
        ...(query.actorId ? { actorId: query.actorId } : {}),
        ...(query.action ? { action: query.action } : {}),
        ...(query.from || query.to
          ? {
              occurredAt: {
                ...(query.from ? { gte: query.from } : {}),
                ...(query.to ? { lte: query.to } : {}),
              },
            }
          : {}),
      };
      const [records, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { occurredAt: 'desc' },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          select: {
            id: true,
            tenantId: true,
            actorId: true,
            actorRole: true,
            action: true,
            resource: true,
            resourceId: true,
            occurredAt: true,
            correlationId: true,
          },
        }),
        prisma.auditLog.count({ where }),
      ]);
      res.status(200).json(
        successResponse(records, {
          total,
          page: query.page,
          limit: query.limit,
          totalPages: Math.ceil(total / query.limit),
        }),
      );
    }),
  );

  router.get(
    '/audit/:id',
    requirePermission('audit:read'),
    asyncHandler(async (req, res) => {
      const record = await prisma.auditLog.findFirst({
        where: {
          id: req.params.id,
          ...(req.user!.role === 'PLATFORM_ADMIN' ? {} : { tenantId: req.tenantId! }),
        },
      });
      if (!record) throw new NotFoundError('Audit record', req.params.id);
      res.status(200).json(
        successResponse({
          ...record,
          oldValue: redactSecrets(record.oldValue),
          newValue: redactSecrets(record.newValue),
          metadata: redactSecrets(record.metadata),
        }),
      );
    }),
  );

  // Everything below is platform-admin only.
  router.use(requirePermission('platform:operations'));

  router.get(
    '/internal-health',
    asyncHandler(async (req, res) => {
      const now = new Date();
      const [
        activeRefreshTokens,
        oauthAccounts,
        passwordResetTokens,
        emailVerifyTokens,
        pendingInvitations,
        ticketSequences,
        analyticsSnapshots,
        latestSnapshot,
        reportJobs,
        tenantRoles,
        roleMemberships,
        webhookEvents,
        outboxEvents,
      ] = await Promise.all([
        prisma.refreshToken.count({
          where: { isRevoked: false, expiresAt: { gt: now } },
        }),
        prisma.oAuthAccount.count(),
        prisma.passwordResetToken.count({
          where: { usedAt: null, expiresAt: { gt: now } },
        }),
        prisma.emailVerifyToken.count({
          where: { usedAt: null, expiresAt: { gt: now } },
        }),
        prisma.invitation.count({
          where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
        }),
        prisma.ticketSequence.count(),
        prisma.analyticsSnapshot.count(),
        prisma.analyticsSnapshot.findFirst({
          orderBy: { snapshotDate: 'desc' },
          select: { snapshotDate: true },
        }),
        prisma.reportJob.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.role.count({ where: { tenantId: { not: null } } }),
        prisma.userRoleMembership.count(),
        prisma.webhookEvent.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.outboxEvent.groupBy({ by: ['status'], _count: { _all: true } }),
      ]);
      const counts = (rows: Array<{ status: string; _count: { _all: number } }>) =>
        Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
      await auditView(req, 'operations.internal-health');
      res.status(200).json(
        successResponse({
          tokens: {
            activeRefreshTokens,
            oauthAccounts,
            passwordResetTokens,
            emailVerifyTokens,
            pendingInvitations,
          },
          ticketSequences,
          analyticsSnapshots: {
            count: analyticsSnapshots,
            latest: latestSnapshot?.snapshotDate ?? null,
          },
          reportJobs: counts(reportJobs),
          roles: { tenantRoles, roleMemberships },
          webhookEvents: counts(webhookEvents),
          outboxEvents: counts(outboxEvents),
          providers: await providers.getStatus({ checkHealth: false }),
        }),
      );
    }),
  );

  router.get(
    '/providers',
    asyncHandler(async (req, res) => {
      const checkHealth = req.query.check === 'true';
      await auditView(req, 'operations.providers');
      res.status(200).json(successResponse(await providers.getStatus({ checkHealth })));
    }),
  );

  router.get(
    '/integrations',
    asyncHandler(async (req, res) => {
      const query = z
        .object({
          tenantId: z.string().uuid().optional(),
          provider: z.string().max(50).optional(),
        })
        .parse(req.query);
      await auditView(req, 'operations.integrations');
      res.status(200).json(successResponse(await channels.listAll(query)));
    }),
  );

  router.get(
    '/outbox',
    asyncHandler(async (req, res) => {
      const result = await operations.listOutbox(recordQuerySchema.parse(req.query));
      await auditView(req, 'operations.outbox');
      res.status(200).json(successResponse(result.rows, result.meta));
    }),
  );
  router.get(
    '/outbox/:id',
    asyncHandler(async (req, res) => {
      const record = await operations.getOutbox(req.params.id);
      await auditView(req, 'operations.outbox', req.params.id);
      res.status(200).json(successResponse(record));
    }),
  );
  router.post(
    '/outbox/:id/retry',
    validate(interventionSchema),
    asyncHandler(async (req, res) => {
      res
        .status(202)
        .json(
          successResponse(
            await operations.retryOutbox(req.params.id, toOperator(req), req.body.reason),
          ),
        );
    }),
  );
  router.post(
    '/outbox/:id/replay',
    validate(interventionSchema),
    asyncHandler(async (req, res) => {
      res
        .status(202)
        .json(
          successResponse(
            await operations.replayOutbox(
              req.params.id,
              toOperator(req),
              req.body.reason,
            ),
          ),
        );
    }),
  );
  router.post(
    '/outbox/:id/cancel',
    validate(interventionSchema),
    asyncHandler(async (req, res) => {
      res
        .status(200)
        .json(
          successResponse(
            await operations.cancelOutbox(
              req.params.id,
              toOperator(req),
              req.body.reason,
            ),
          ),
        );
    }),
  );

  router.get(
    '/webhooks',
    asyncHandler(async (req, res) => {
      const result = await operations.listWebhooks(recordQuerySchema.parse(req.query));
      await auditView(req, 'operations.webhooks');
      res.status(200).json(successResponse(result.rows, result.meta));
    }),
  );
  router.get(
    '/webhooks/:id',
    asyncHandler(async (req, res) => {
      const record = await operations.getWebhook(req.params.id);
      await auditView(req, 'operations.webhooks', req.params.id);
      res.status(200).json(successResponse(record));
    }),
  );
  router.post(
    '/webhooks/:id/retry',
    validate(interventionSchema),
    asyncHandler(async (req, res) => {
      res
        .status(200)
        .json(
          successResponse(
            await operations.retryWebhook(
              req.params.id,
              toOperator(req),
              req.body.reason,
            ),
          ),
        );
    }),
  );
  router.post(
    '/webhooks/:id/replay',
    validate(interventionSchema),
    asyncHandler(async (req, res) => {
      res
        .status(200)
        .json(
          successResponse(
            await operations.replayWebhook(
              req.params.id,
              toOperator(req),
              req.body.reason,
            ),
          ),
        );
    }),
  );
  router.post(
    '/webhooks/:id/cancel',
    validate(interventionSchema),
    asyncHandler(async (req, res) => {
      res
        .status(200)
        .json(
          successResponse(
            await operations.cancelWebhook(
              req.params.id,
              toOperator(req),
              req.body.reason,
            ),
          ),
        );
    }),
  );

  router.get(
    '/operations/settings',
    asyncHandler(async (_req, res) => {
      res.status(200).json(successResponse(await operations.getSettings()));
    }),
  );
  router.patch(
    '/operations/settings',
    validate(settingsUpdateSchema),
    asyncHandler(async (req, res) => {
      const { reason, ...changes } = req.body;
      res
        .status(200)
        .json(
          successResponse(
            await operations.updateSettings(changes, toOperator(req), reason),
          ),
        );
    }),
  );
  router.post(
    '/operations/purge',
    validate(interventionSchema),
    asyncHandler(async (req, res) => {
      res
        .status(200)
        .json(successResponse(await operations.purge(toOperator(req), req.body.reason)));
    }),
  );
  router.get(
    '/operations/interventions',
    asyncHandler(async (req, res) => {
      const query = interventionQuerySchema.parse(req.query);
      res
        .status(200)
        .json(
          successResponse(
            await operations.listInterventions(query.targetType, query.targetId),
          ),
        );
    }),
  );

  return router;
}
