import type { PrismaClient } from '@prisma/client';
import { mockDeep } from 'jest-mock-extended';

import { InvitationService } from '../../../../src/application/auth/services/invitation.service';
import type { AuditRepository } from '../../../../src/infrastructure/database/repositories/audit.repository';
import type { EmailQueue } from '../../../../src/infrastructure/queue/queues/email.queue';
import { ForbiddenError } from '../../../../src/shared/errors/application.error';
import {
  ConflictError,
  ValidationError,
} from '../../../../src/shared/errors/domain.error';

describe('InvitationService', () => {
  const prisma = mockDeep<PrismaClient>();
  const emailQueue = mockDeep<EmailQueue>();
  const auditRepo = mockDeep<AuditRepository>();
  const service = new InvitationService(prisma, emailQueue, auditRepo);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects expired invitations before changing an account', async () => {
    prisma.invitation.findUnique.mockResolvedValue({
      id: 'invite',
      expiresAt: new Date(0),
      acceptedAt: null,
      revokedAt: null,
    } as never);

    await expect(service.accept({ token: 'expired' })).rejects.toThrow(ValidationError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a customer invitation for another email', async () => {
    prisma.customer.findFirst.mockResolvedValue({
      id: 'customer',
      email: 'owner@example.com',
    } as never);

    await expect(
      service.create({
        tenantId: 'tenant',
        actorId: 'manager',
        role: 'CUSTOMER',
        customerId: 'customer',
        email: 'other@example.com',
      }),
    ).rejects.toThrow(ValidationError);
    expect(prisma.invitation.create).not.toHaveBeenCalled();
  });

  it('rejects linking an account from another organization', async () => {
    prisma.invitation.findUnique.mockResolvedValue({
      id: 'invite',
      email: 'owner@example.com',
      tenantId: 'tenant',
      expiresAt: new Date(Date.now() + 60_000),
      acceptedAt: null,
      revokedAt: null,
    } as never);
    prisma.user.findUnique.mockResolvedValue({
      id: 'existing',
      role: 'CUSTOMER',
      tenantId: 'another-tenant',
    } as never);

    await expect(service.accept({ token: 'valid' })).rejects.toThrow(ConflictError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  function mockValidInvitation(): void {
    prisma.invitation.findUnique.mockResolvedValue({
      id: 'invite',
      email: 'owner@example.com',
      tenantId: 'tenant',
      role: 'CUSTOMER',
      customerId: 'customer',
      expiresAt: new Date(Date.now() + 60_000),
      acceptedAt: null,
      revokedAt: null,
    } as never);
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (work: (tx: PrismaClient) => Promise<unknown>) => work(prisma),
    );
    prisma.invitation.updateMany.mockResolvedValue({ count: 1 });
    prisma.tenant.findUnique.mockResolvedValue({ status: 'ACTIVE' } as never);
    prisma.customer.findFirst.mockResolvedValue({ email: 'owner@example.com' } as never);
    prisma.user.update.mockResolvedValue({ id: 'existing' } as never);
  }

  it('takes over an unverified tenantless account only with a new password', async () => {
    mockValidInvitation();
    prisma.user.findUnique.mockResolvedValue({
      id: 'existing',
      role: 'CUSTOMER',
      tenantId: null,
      emailVerifiedAt: null,
    } as never);

    await expect(service.accept({ token: 'email-proof' })).rejects.toThrow(
      ValidationError,
    );

    await service.accept({ token: 'email-proof', password: 'NewPass@12345' });

    // Whoever registered the address before cannot keep access.
    expect(prisma.oAuthAccount.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'existing' },
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'existing', tenantId: null },
        data: expect.objectContaining({
          tenantId: 'tenant',
          emailVerifiedAt: expect.any(Date),
          passwordHash: expect.any(String),
        }),
      }),
    );
    expect(prisma.customerLink.create).toHaveBeenCalledWith({
      data: { userId: 'existing', customerId: 'customer', tenantId: 'tenant' },
    });
  });

  it('requires a verified account owner to be signed in or give the password', async () => {
    mockValidInvitation();
    prisma.user.findUnique.mockResolvedValue({
      id: 'existing',
      role: 'CUSTOMER',
      tenantId: null,
      emailVerifiedAt: new Date(),
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$invalid',
    } as never);

    await expect(service.accept({ token: 'email-proof' })).rejects.toThrow(
      ForbiddenError,
    );
    await expect(
      service.accept({ token: 'email-proof', authenticatedUserId: 'someone-else' }),
    ).rejects.toThrow(ForbiddenError);
    expect(prisma.$transaction).not.toHaveBeenCalled();

    await service.accept({ token: 'email-proof', authenticatedUserId: 'existing' });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ passwordHash: expect.anything() }),
      }),
    );
    expect(prisma.oAuthAccount.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects a second acceptance of the same invitation', async () => {
    mockValidInvitation();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.invitation.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.accept({
        token: 'email-proof',
        password: 'NewPass@12345',
        firstName: 'A',
        lastName: 'B',
      }),
    ).rejects.toThrow(ConflictError);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
