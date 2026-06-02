import argon2 from 'argon2';
import crypto from 'crypto';
import { Prisma, PrismaClient, UserRole } from '@prisma/client';
import { TokenPair, TokenService } from './token.service';
import { EmailQueue } from '../../../infrastructure/queue/queues/email.queue';
import { AuditRepository } from '../../../infrastructure/database/repositories/audit.repository';
import { CacheService } from '../../../infrastructure/cache/cache.service';
import { Password } from '../../../domain/user/value-objects/password.vo';
import {
  UnauthorizedError,
  ForbiddenError,
} from '../../../shared/errors/application.error';
import {
  ConflictError,
  ValidationError,
} from '../../../shared/errors/domain.error';
import { logger } from '../../../shared/utils/logger.util';
import { appConfig } from '../../../config/app.config';

export interface RegisterDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  tenantId?: string;
  role?: string;
}

export interface LoginDto {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthResult {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    tenantId?: string;
    status: string;
    emailVerifiedAt: Date | null;
  };
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tokenService: TokenService,
    private readonly emailQueue: EmailQueue,
    private readonly auditRepo: AuditRepository,
    private readonly cache: CacheService,
  ) {}

  async register(dto: RegisterDto): Promise<{ userId: string }> {
    // Check for existing user
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictError('An account with this email already exists');
    }

    Password.create(dto.password);

    const passwordHash = await this.hashPassword(dto.password);
    const userId = crypto.randomUUID();

    const role: UserRole =
      dto.role &&
      ['PLATFORM_ADMIN', 'TENANT_MANAGER', 'AGENT', 'CUSTOMER'].includes(dto.role)
        ? (dto.role as UserRole)
        : 'AGENT';

    const user = await this.prisma.user.create({
      data: {
        id: userId,
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role,
        tenantId: dto.tenantId,
        status: 'PENDING_VERIFICATION',
      },
    });

    // Create email verification token
    const rawToken = this.tokenService.generateSecureToken();
    const tokenHash = await this.tokenService.hashToken(rawToken);

    await this.prisma.emailVerifyToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    // Queue verification email
    await this.emailQueue.addUrgent({
      to: user.email,
      subject: 'Verify your OmniSupport account',
      html: this.buildVerificationEmailHtml(
        user.firstName,
        rawToken,
        userId,
      ),
    });

    await this.auditRepo.create({
      tenantId: dto.tenantId,
      actorId: userId,
      actorRole: dto.role ?? 'AGENT',
      action: 'CREATE',
      resource: 'users',
      resourceId: userId,
      newValue: { email: dto.email, role: dto.role },
    });

    logger.info('User registered', { userId, email: dto.email });

    return { userId: user.id };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new UnauthorizedError(
        `Account locked. Try again in ${minutesLeft} minutes`,
      );
    }

    // Check account status
    if (user.status === 'SUSPENDED') {
      throw new ForbiddenError('Your account has been suspended');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedError(
        'This account uses social login. Please use Google to sign in.',
      );
    }

    // Verify password
    const isValidPassword = await argon2.verify(
      user.passwordHash,
      dto.password,
    );

    if (!isValidPassword) {
      // Increment failed attempts
      const failedAttempts = user.failedLoginAttempts + 1;
      const updateData: Prisma.UserUpdateInput = {
        failedLoginAttempts: failedAttempts,
      };

      if (failedAttempts >= 5) {
        updateData.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        logger.warn('Account locked due to failed attempts', {
          userId: user.id,
          email: user.email,
        });
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });

      throw new UnauthorizedError('Invalid email or password');
    }

    // Check email verification for non-admin users
    if (!user.emailVerifiedAt && user.role !== 'PLATFORM_ADMIN') {
      throw new ForbiddenError(
        'Please verify your email address before logging in',
      );
    }

    // Check tenant status if tenant user
    if (user.tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
      });

      if (tenant?.status === 'SUSPENDED') {
        throw new ForbiddenError(
          'Your organization account has been suspended',
        );
      }

      if (tenant?.status === 'CANCELLED') {
        throw new ForbiddenError(
          'Your organization account has been cancelled',
        );
      }
    }

    // Reset failed attempts on successful login
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: dto.ipAddress,
      },
    });

    // Generate tokens
    const tokenPair = await this.tokenService.createTokenPair(
      user.id,
      {
        tenantId: user.tenantId ?? undefined,
        role: user.role,
        email: user.email,
      },
      dto.ipAddress,
      dto.userAgent,
    );

    await this.auditRepo.create({
      tenantId: user.tenantId ?? undefined,
      actorId: user.id,
      actorRole: user.role,
      action: 'LOGIN',
      resource: 'auth',
      ipAddress: dto.ipAddress,
      userAgent: dto.userAgent,
    });

    logger.info('User logged in', {
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId ?? undefined,
        status: user.status,
        emailVerifiedAt: user.emailVerifiedAt,
      },
      ...tokenPair,
    };
  }

  async verifyEmail(userId: string, token: string): Promise<void> {
    const tokenHash = await this.tokenService.hashToken(token);

    const verifyToken = await this.prisma.emailVerifyToken.findFirst({
      where: { userId, tokenHash, usedAt: null },
    });

    if (!verifyToken) {
      throw new ValidationError('Invalid or expired verification token');
    }

    if (verifyToken.expiresAt < new Date()) {
      throw new ValidationError('Verification token has expired');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          emailVerifiedAt: new Date(),
          status: 'ACTIVE',
        },
      }),
      this.prisma.emailVerifyToken.update({
        where: { id: verifyToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    logger.info('Email verified', { userId });
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Always return success to prevent email enumeration
    if (!user) return;

    // Invalidate existing reset tokens
    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    const rawToken = this.tokenService.generateSecureToken();
    const tokenHash = await this.tokenService.hashToken(rawToken);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    await this.emailQueue.addUrgent({
      to: user.email,
      subject: 'Reset your OmniSupport password',
      html: this.buildPasswordResetEmailHtml(user.firstName, rawToken),
    });

    logger.info('Password reset email sent', { userId: user.id });
  }

  async resetPassword(
    token: string,
    newPassword: string,
    ipAddress?: string,
  ): Promise<void> {
    const tokenHash = await this.tokenService.hashToken(token);

    const resetToken = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null },
      include: { user: true },
    });

    if (!resetToken) {
      throw new ValidationError('Invalid or expired reset token');
    }

    if (resetToken.expiresAt < new Date()) {
      throw new ValidationError('Reset token has expired');
    }

    Password.create(newPassword);

    const passwordHash = await this.hashPassword(newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // Revoke all existing sessions
    await this.tokenService.revokeAllUserTokens(resetToken.userId);
    await this.cache.invalidateUser(resetToken.userId);

    await this.auditRepo.create({
      actorId: resetToken.userId,
      action: 'UPDATE',
      resource: 'auth',
      resourceId: resetToken.userId,
      metadata: { action: 'PASSWORD_RESET' },
      ipAddress,
    });

    logger.info('Password reset successful', { userId: resetToken.userId });
  }

  async logout(refreshToken: string, userId: string): Promise<void> {
    await this.tokenService.revokeToken(refreshToken);
    await this.cache.invalidateUser(userId);

    await this.auditRepo.create({
      actorId: userId,
      action: 'LOGOUT',
      resource: 'auth',
    });
  }

  async refreshTokens(
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<TokenPair> {
    return this.tokenService.rotateRefreshToken(
      refreshToken,
      ipAddress,
      userAgent,
    );
  }

  private async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }

  private buildVerificationEmailHtml(
    firstName: string,
    token: string,
    userId: string,
  ): string {
    const verifyUrl = `${appConfig.frontendUrl}/verify-email?token=${token}&userId=${userId}`;
    return `
      <h1>Welcome to OmniSupport, ${firstName}!</h1>
      <p>Please verify your email address to activate your account.</p>
      <a href="${verifyUrl}" style="background:#4F46E5;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;">
        Verify Email
      </a>
      <p>This link expires in 24 hours.</p>
    `;
  }

  private buildPasswordResetEmailHtml(
    firstName: string,
    token: string,
  ): string {
    const resetUrl = `${appConfig.frontendUrl}/reset-password?token=${token}`;
    return `
      <h1>Reset your password, ${firstName}</h1>
      <p>Click the button below to reset your password. This link expires in 1 hour.</p>
      <a href="${resetUrl}" style="background:#4F46E5;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;">
        Reset Password
      </a>
      <p>If you didn't request this, please ignore this email.</p>
    `;
  }
}

// Re-export TokenPair type
export type { TokenPair } from './token.service';
