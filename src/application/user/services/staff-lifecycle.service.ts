import type { PrismaClient } from '@prisma/client';

import type { AuditRepository } from '../../../infrastructure/database/repositories/audit.repository';
import { ForbiddenError } from '../../../shared/errors/application.error';
import { ConflictError, NotFoundError } from '../../../shared/errors/domain.error';
import type { TokenService } from '../../auth/services/token.service';

export class StaffLifecycleService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tokenService: TokenService,
    private readonly auditRepo: AuditRepository,
  ) {}

  async setActive(input: {
    tenantId: string;
    actorId: string;
    userId: string;
    active: boolean;
  }): Promise<void> {
    if (input.actorId === input.userId)
      throw new ForbiddenError('You cannot change your own status');
    const target = await this.prisma.user.findFirst({
      where: { id: input.userId, tenantId: input.tenantId, role: 'AGENT' },
    });
    if (!target) throw new NotFoundError('Agent', input.userId);
    const metadata = target.metadata;
    if (
      input.active &&
      metadata &&
      typeof metadata === 'object' &&
      !Array.isArray(metadata) &&
      'removedAt' in metadata
    ) {
      throw new ConflictError('Removed agents cannot be reactivated');
    }
    await this.prisma.user.update({
      where: { id: target.id },
      data: { status: input.active ? 'ACTIVE' : 'INACTIVE' },
    });
    if (!input.active)
      await this.tokenService.revokeAllUserTokens(target.id, 'ACCOUNT_DISABLED');
    await this.auditRepo.create({
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: 'UPDATE',
      resource: 'users',
      resourceId: target.id,
      newValue: { status: input.active ? 'ACTIVE' : 'INACTIVE' },
    });
  }

  async remove(input: {
    tenantId: string;
    actorId: string;
    userId: string;
    replacementAgentId?: string;
  }): Promise<void> {
    if (input.actorId === input.userId)
      throw new ForbiddenError('You cannot remove yourself');
    if (input.replacementAgentId === input.userId) {
      throw new ConflictError('Replacement must be another agent');
    }
    const target = await this.prisma.user.findFirst({
      where: { id: input.userId, tenantId: input.tenantId, role: 'AGENT' },
    });
    if (!target) throw new NotFoundError('Agent', input.userId);
    if (input.replacementAgentId) {
      const replacement = await this.prisma.user.findFirst({
        where: {
          id: input.replacementAgentId,
          tenantId: input.tenantId,
          role: 'AGENT',
          status: 'ACTIVE',
        },
      });
      if (!replacement)
        throw new NotFoundError('Active replacement agent', input.replacementAgentId);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.ticket.updateMany({
        where: {
          tenantId: input.tenantId,
          assignedAgentId: input.userId,
          status: { notIn: ['RESOLVED', 'CLOSED'] },
        },
        data: { assignedAgentId: input.replacementAgentId ?? null },
      });
      await tx.customer.updateMany({
        where: { tenantId: input.tenantId, assignedAgentId: input.userId },
        data: { assignedAgentId: input.replacementAgentId ?? null },
      });
      // Tenant role grants end with the membership; the user row stays for history.
      await tx.userRoleMembership.deleteMany({
        where: { userId: input.userId, tenantId: input.tenantId },
      });
      await tx.user.update({
        where: { id: input.userId },
        data: {
          status: 'INACTIVE',
          metadata: {
            ...(target.metadata &&
            typeof target.metadata === 'object' &&
            !Array.isArray(target.metadata)
              ? target.metadata
              : {}),
            removedAt: new Date().toISOString(),
          },
        },
      });
    });
    await this.tokenService.revokeAllUserTokens(input.userId, 'ACCOUNT_REMOVED');
    await this.auditRepo.create({
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: 'DELETE',
      resource: 'users',
      resourceId: input.userId,
      metadata: { replacementAgentId: input.replacementAgentId ?? null },
    });
  }
}
