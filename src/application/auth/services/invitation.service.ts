import crypto from 'crypto';

import type { PrismaClient } from '@prisma/client';

import { getAppConfig } from '../../../config/app.config';
import { Password } from '../../../domain/user/value-objects/password.vo';
import type { AuditRepository } from '../../../infrastructure/database/repositories/audit.repository';
import type { EmailQueue } from '../../../infrastructure/queue/queues/email.queue';
import { PasswordHasher } from '../../../infrastructure/security/password-hasher';
import { ForbiddenError } from '../../../shared/errors/application.error';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/domain.error';
import { sha256 } from '../../../shared/utils/crypto.util';
import { escapeHtml } from '../../../shared/utils/html.util';

const INVITATION_LIFETIME_MS = 24 * 60 * 60 * 1000;

export class InvitationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailQueue: EmailQueue,
    private readonly auditRepo: AuditRepository,
    private readonly passwordHasher: PasswordHasher = new PasswordHasher(),
  ) {}

  list(tenantId: string) {
    return this.prisma.invitation.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        email: true,
        role: true,
        customerId: true,
        createdAt: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
      },
    });
  }

  async create(input: {
    tenantId: string;
    actorId: string;
    email: string;
    role: 'CUSTOMER' | 'AGENT' | 'TENANT_MANAGER';
    customerId?: string;
  }): Promise<{ id: string; expiresAt: Date }> {
    const email = input.email.toLowerCase();
    if (input.role === 'CUSTOMER' && !input.customerId) {
      throw new ValidationError('A customer record is required');
    }
    if (input.role !== 'CUSTOMER' && input.customerId) {
      throw new ValidationError('Staff invitations cannot link a customer record');
    }
    if (input.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: input.customerId, tenantId: input.tenantId },
      });
      if (!customer) throw new NotFoundError('Customer', input.customerId);
      if (customer.email.toLowerCase() !== email) {
        throw new ValidationError('Invitation email must match the customer record');
      }
      const linked = await this.prisma.customerLink.findUnique({
        where: { customerId: input.customerId },
      });
      if (linked) throw new ConflictError('Customer already has a portal account');
    }
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (
      existing &&
      (existing.tenantId ||
        existing.role !== 'CUSTOMER' ||
        existing.status === 'SUSPENDED')
    )
      throw new ConflictError('Email cannot accept an organization invitation');

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS);
    const invitation = await this.prisma.invitation.create({
      data: {
        tenantId: input.tenantId,
        invitedById: input.actorId,
        email,
        role: input.role,
        customerId: input.customerId,
        tokenHash: sha256(token),
        expiresAt,
      },
    });
    await this.sendEmail(email, token);
    await this.auditRepo.create({
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: 'CREATE',
      resource: 'invitations',
      resourceId: invitation.id,
      newValue: { role: input.role, customerId: input.customerId },
    });
    return { id: invitation.id, expiresAt };
  }

  /**
   * Accepts an invitation. Holding the emailed token proves ownership of the address.
   * An existing tenantless account is linked only when its owner also proves control of
   * the account: a verified account must be signed in (or give its current password);
   * an unverified account may have been registered by someone else, so its password is
   * replaced and its sessions and social logins are revoked.
   */
  async accept(input: {
    token: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    authenticatedUserId?: string;
  }): Promise<void> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: sha256(input.token) },
    });
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.expiresAt <= new Date()
    ) {
      throw new ValidationError('Invitation is invalid or expired');
    }
    const existing = await this.prisma.user.findUnique({
      where: { email: invitation.email },
    });
    if (
      existing &&
      (existing.tenantId ||
        existing.role !== 'CUSTOMER' ||
        existing.status === 'SUSPENDED')
    )
      throw new ConflictError('Account cannot accept this invitation');
    if (
      input.authenticatedUserId &&
      (!existing || existing.id !== input.authenticatedUserId)
    ) {
      throw new ForbiddenError('This invitation was sent to a different account');
    }
    if (!existing && (!input.password || !input.firstName || !input.lastName)) {
      throw new ValidationError('Name and password are required for a new account');
    }

    let passwordHash: string | undefined;
    let resetExistingCredentials = false;
    if (!existing) {
      Password.create(input.password!);
      passwordHash = await this.passwordHasher.hash(input.password!);
    } else if (existing.emailVerifiedAt) {
      const signedIn = input.authenticatedUserId === existing.id;
      const passwordMatches =
        !!input.password &&
        !!existing.passwordHash &&
        (await this.passwordHasher.verify(existing.passwordHash, input.password));
      if (!signedIn && !passwordMatches) {
        throw new ForbiddenError(
          'Sign in to the invited account, or give its password, to accept',
        );
      }
    } else {
      if (!input.password) {
        throw new ValidationError('Choose a password to activate this account');
      }
      Password.create(input.password);
      passwordHash = await this.passwordHasher.hash(input.password);
      resetExistingCredentials = true;
    }

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: {
          id: invitation.id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count !== 1)
        throw new ConflictError('Invitation has already been used');
      const tenant = await tx.tenant.findUnique({
        where: { id: invitation.tenantId },
        select: { status: true },
      });
      if (!tenant || !['ACTIVE', 'TRIAL'].includes(tenant.status)) {
        throw new ConflictError('Organization is not active');
      }
      if (invitation.customerId) {
        const customer = await tx.customer.findFirst({
          where: { id: invitation.customerId, tenantId: invitation.tenantId },
        });
        if (!customer || customer.email.toLowerCase() !== invitation.email) {
          throw new ConflictError('Customer record changed since invitation');
        }
      }
      if (invitation.role === 'AGENT' || invitation.role === 'TENANT_MANAGER') {
        const [staff, limits] = await Promise.all([
          tx.user.count({
            where: {
              tenantId: invitation.tenantId,
              role: { in: ['AGENT', 'TENANT_MANAGER'] },
              status: 'ACTIVE',
            },
          }),
          tx.tenant.findUniqueOrThrow({
            where: { id: invitation.tenantId },
            select: { maxAgents: true },
          }),
        ]);
        if (staff >= limits.maxAgents) {
          throw new ConflictError('Organization has reached its staff limit');
        }
      }
      if (resetExistingCredentials && existing) {
        await tx.oAuthAccount.deleteMany({ where: { userId: existing.id } });
        await tx.refreshToken.updateMany({
          where: { userId: existing.id, isRevoked: false },
          data: {
            isRevoked: true,
            revokedAt: new Date(),
            revokedReason: 'INVITATION_ACCEPTED',
          },
        });
      }
      const user = existing
        ? await tx.user.update({
            where: { id: existing.id, tenantId: null },
            data: {
              tenantId: invitation.tenantId,
              role: invitation.role,
              status: 'ACTIVE',
              emailVerifiedAt: new Date(),
              failedLoginAttempts: 0,
              lockedUntil: null,
              ...(passwordHash ? { passwordHash } : {}),
            },
          })
        : await tx.user.create({
            data: {
              email: invitation.email,
              passwordHash,
              firstName: input.firstName!,
              lastName: input.lastName!,
              tenantId: invitation.tenantId,
              role: invitation.role,
              status: 'ACTIVE',
              emailVerifiedAt: new Date(),
            },
          });
      if (invitation.customerId) {
        await tx.customerLink.create({
          data: {
            userId: user.id,
            customerId: invitation.customerId,
            tenantId: invitation.tenantId,
          },
        });
      }
    });
    await this.auditRepo.create({
      tenantId: invitation.tenantId,
      action: 'UPDATE',
      resource: 'invitations',
      resourceId: invitation.id,
      metadata: { action: 'ACCEPTED' },
    });
  }

  async revoke(id: string, tenantId: string, actorId: string): Promise<void> {
    const changed = await this.prisma.invitation.updateMany({
      where: { id, tenantId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (changed.count !== 1) throw new NotFoundError('Active invitation', id);
    await this.auditRepo.create({
      tenantId,
      actorId,
      action: 'DELETE',
      resource: 'invitations',
      resourceId: id,
    });
  }

  async resend(id: string, tenantId: string, actorId: string): Promise<void> {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id, tenantId, acceptedAt: null, revokedAt: null },
    });
    if (!invitation) throw new NotFoundError('Active invitation', id);
    const token = crypto.randomBytes(32).toString('hex');
    await this.prisma.invitation.update({
      where: { id },
      data: {
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS),
      },
    });
    await this.sendEmail(invitation.email, token);
    await this.auditRepo.create({
      tenantId,
      actorId,
      action: 'UPDATE',
      resource: 'invitations',
      resourceId: id,
      metadata: { action: 'RESENT' },
    });
  }

  private async sendEmail(email: string, token: string): Promise<void> {
    const url = `${getAppConfig().frontendUrl}/accept-invitation?token=${encodeURIComponent(token)}`;
    await this.emailQueue.addUrgent({
      to: email,
      subject: 'Your OmniSupport invitation',
      html: `<p>You have been invited to OmniSupport.</p><a href="${escapeHtml(url)}">Accept invitation</a><p>This link expires in 24 hours.</p>`,
    });
  }
}
