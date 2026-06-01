import { AuthService } from '../../../../src/application/auth/services/auth.service';
import { TokenService } from '../../../../src/application/auth/services/token.service';
import { mockDeep, MockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { EmailQueue } from '../../../../src/infrastructure/queue/queues/email.queue';
import { AuditRepository } from '../../../../src/infrastructure/database/repositories/audit.repository';
import { CacheService } from '../../../../src/infrastructure/cache/cache.service';
import { ConflictError, ValidationError } from '../../../../src/shared/errors/domain.error';
import { UnauthorizedError, ForbiddenError } from '../../../../src/shared/errors/application.error';

describe('AuthService', () => {
  let authService: AuthService;
  let prisma: MockProxy<PrismaClient>;
  let tokenService: MockProxy<TokenService>;
  let emailQueue: MockProxy<EmailQueue>;
  let auditRepo: MockProxy<AuditRepository>;
  let cacheService: MockProxy<CacheService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    tokenService = mockDeep<TokenService>();
    emailQueue = mockDeep<EmailQueue>();
    auditRepo = mockDeep<AuditRepository>();
    cacheService = mockDeep<CacheService>();

    authService = new AuthService(
      prisma,
      tokenService,
      emailQueue,
      auditRepo,
      cacheService,
    );
  });

  describe('register()', () => {
    const validRegisterDto = {
      email: 'test@example.com',
      password: 'TestPass@123!',
      firstName: 'John',
      lastName: 'Doe',
    };

    it('should register user successfully', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue({
        id: 'user-id',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      });
      (prisma.emailVerifyToken.create as jest.Mock).mockResolvedValue({});
      (tokenService.generateSecureToken as jest.Mock).mockReturnValue('raw-token');
      (tokenService.hashToken as jest.Mock).mockResolvedValue('hashed-token');
      (emailQueue.addUrgent as jest.Mock).mockResolvedValue(undefined);
      (auditRepo.create as jest.Mock).mockResolvedValue(undefined);

      const result = await authService.register(validRegisterDto);

      expect(result).toHaveProperty('userId');
      expect(prisma.user.create).toHaveBeenCalledTimes(1);
      expect(emailQueue.addUrgent).toHaveBeenCalledTimes(1);
    });

    it('should throw ConflictError if email already exists', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'existing-user',
        email: 'test@example.com',
      });

      await expect(authService.register(validRegisterDto)).rejects.toThrow(
        ConflictError,
      );
    });

    it('should throw ValidationError for weak password', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        authService.register({ ...validRegisterDto, password: 'weak' }),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for missing uppercase', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        authService.register({
          ...validRegisterDto,
          password: 'testpass@123!',
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('login()', () => {
    const validUser = {
      id: 'user-id',
      email: 'test@example.com',
      passwordHash: null as any, // Will be set in test
      firstName: 'John',
      lastName: 'Doe',
      role: 'AGENT',
      tenantId: 'tenant-id',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    };

    beforeEach(async () => {
      const argon2 = await import('argon2');
      validUser.passwordHash = await argon2.hash('TestPass@123!');
    });

    it('should login successfully with valid credentials', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(validUser);
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
        status: 'ACTIVE',
      });
      (prisma.user.update as jest.Mock).mockResolvedValue(validUser);
      (tokenService.createTokenPair as jest.Mock).mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 900,
      });
      (auditRepo.create as jest.Mock).mockResolvedValue(undefined);

      const result = await authService.login({
        email: 'test@example.com',
        password: 'TestPass@123!',
        ipAddress: '127.0.0.1',
      });

      expect(result.accessToken).toBe('access-token');
      expect(result.user.email).toBe('test@example.com');
    });

    it('should throw UnauthorizedError for non-existent user', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'notfound@example.com',
          password: 'TestPass@123!',
        }),
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError for wrong password', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(validUser);
      (prisma.user.update as jest.Mock).mockResolvedValue({
        ...validUser,
        failedLoginAttempts: 1,
      });

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'WrongPass@123!',
        }),
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should throw ForbiddenError for suspended user', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...validUser,
        status: 'SUSPENDED',
      });

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'TestPass@123!',
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw UnauthorizedError for locked account', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...validUser,
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
      });

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'TestPass@123!',
        }),
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should throw ForbiddenError for unverified email', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...validUser,
        emailVerifiedAt: null,
        role: 'AGENT',
      });

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'TestPass@123!',
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('forgotPassword()', () => {
    it('should not throw for non-existent email (prevents enumeration)', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        authService.forgotPassword('notfound@example.com'),
      ).resolves.not.toThrow();
    });

    it('should send reset email for existing user', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-id',
        email: 'test@example.com',
        firstName: 'John',
      });
      (prisma.passwordResetToken.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (tokenService.generateSecureToken as jest.Mock).mockReturnValue('raw-token');
      (tokenService.hashToken as jest.Mock).mockResolvedValue('hashed-token');
      (prisma.passwordResetToken.create as jest.Mock).mockResolvedValue({});
      (emailQueue.addUrgent as jest.Mock).mockResolvedValue(undefined);

      await authService.forgotPassword('test@example.com');

      expect(emailQueue.addUrgent).toHaveBeenCalledTimes(1);
    });
  });
});