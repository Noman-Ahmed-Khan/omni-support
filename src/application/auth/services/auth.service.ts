import crypto from 'crypto';

import type { Prisma, PrismaClient, UserRole } from '@prisma/client';

import type { TokenPair, TokenService } from './token.service';
import { getAppConfig } from '../../../config/app.config';
import { Password } from '../../../domain/user/value-objects/password.vo';
import type { CacheService } from '../../../infrastructure/cache/cache.service';
import type { AuditRepository } from '../../../infrastructure/database/repositories/audit.repository';
import type { EmailQueue } from '../../../infrastructure/queue/queues/email.queue';
import { PasswordHasher } from '../../../infrastructure/security/password-hasher';
import {
  UnauthorizedError,
  ForbiddenError,
} from '../../../shared/errors/application.error';
import { ValidationError } from '../../../shared/errors/domain.error';
import { escapeHtml } from '../../../shared/utils/html.util';
import { logger } from '../../../shared/utils/logger.util';

/**
 * Public self-registration. Role and organization are intentionally not accepted here:
 * self-registered accounts are tenant-less CUSTOMER accounts with no staff privileges.
 * Staff accounts are created by administrators.
 */
export interface RegisterDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
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

const LOCKOUT_THRESHOLD = 5;
const MAX_LOCKOUT_MINUTES = 15;

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tokenService: TokenService,
    private readonly emailQueue: EmailQueue,
    private readonly auditRepo: AuditRepository,
    private readonly cache: CacheService,
    private readonly passwordHasher: PasswordHasher = new PasswordHasher(),
  ) {}

  /**
   * Registers a customer account. The outcome for an email that is already registered
   * is indistinguishable from a new registration (same response, similar timing), so
   * the endpoint cannot be used to discover accounts. Returns the new user id, or null
   * when nothing was created.
   */
  async register(dto: RegisterDto): Promise<{ userId: string | null }> {
    if (!getAppConfig().allowPublicRegistration) {
      throw new ForbiddenError('Public registration is disabled');
    }

    Password.create(dto.password);

    // Hash before the lookup so both paths take comparable time.
    const passwordHash = await this.hashPassword(dto.password);

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: { id: true },
    });

    if (existing) {
      logger.info('Registration attempted for an existing account', {
        userId: existing.id,
      });
      return { userId: null };
    }

    const userId = crypto.randomUUID();

    const role: UserRole = 'CUSTOMER';

    const user = await this.prisma.user.create({
      data: {
        id: userId,
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role,
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
      html: this.buildVerificationEmailHtml(user.firstName, rawToken, userId),
    });

    await this.auditRepo.create({
      actorId: userId,
      actorRole: role,
      action: 'CREATE',
      resource: 'users',
      resourceId: userId,
      newValue: { email: dto.email, role },
    });

    logger.info('User registered', { userId, email: dto.email });

    return { userId: user.id };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    // Unknown accounts, social-login accounts, locked accounts and wrong passwords all
    // get the same response, and a password hash is always verified so response times
    // do not reveal which accounts exist.
    const isLocked = !!user?.lockedUntil && user.lockedUntil > new Date();
    const isValidPassword = await this.passwordHasher.verify(
      user?.passwordHash ?? (await this.getDummyPasswordHash()),
      dto.password,
    );

    if (!user || !user.passwordHash || isLocked || !isValidPassword) {
      if (user && user.passwordHash && !isLocked && !isValidPassword) {
        await this.recordFailedLogin(user.id, user.failedLoginAttempts + 1);
      }
      throw new UnauthorizedError('Invalid email or password');
    }

    // Only reached with the correct password, so this reveals nothing to an attacker.
    if (user.status === 'SUSPENDED') {
      throw new ForbiddenError('Your account has been suspended');
    }

    // Check email verification for non-admin users
    if (!user.emailVerifiedAt && user.role !== 'PLATFORM_ADMIN') {
      throw new ForbiddenError('Please verify your email address before logging in');
    }

    // Check tenant status if tenant user
    if (user.tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
      });

      if (tenant?.status === 'SUSPENDED') {
        throw new ForbiddenError('Your organization account has been suspended');
      }

      if (tenant?.status === 'CANCELLED') {
        throw new ForbiddenError('Your organization account has been cancelled');
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
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
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
    return this.tokenService.rotateRefreshToken(refreshToken, ipAddress, userAgent);
  }

  private async hashPassword(password: string): Promise<string> {
    return this.passwordHasher.hash(password);
  }

  /**
   * Progressive lockout: from the 5th consecutive failure the account is locked for
   * 1, 2, 4, 8 then 15 minutes, which slows guessing without letting anyone lock an
   * account for long.
   */
  private async recordFailedLogin(userId: string, failedAttempts: number): Promise<void> {
    const data: Prisma.UserUpdateInput = { failedLoginAttempts: failedAttempts };

    if (failedAttempts >= LOCKOUT_THRESHOLD) {
      const minutes = Math.min(
        2 ** (failedAttempts - LOCKOUT_THRESHOLD),
        MAX_LOCKOUT_MINUTES,
      );
      data.lockedUntil = new Date(Date.now() + minutes * 60 * 1000);
      logger.warn('Account temporarily locked after failed logins', {
        userId,
        failedAttempts,
        minutes,
      });
    }

    await this.prisma.user.update({ where: { id: userId }, data });
  }

  private dummyPasswordHash: Promise<string> | null = null;

  /** A real hash to verify against when the account does not exist. */
  private getDummyPasswordHash(): Promise<string> {
    this.dummyPasswordHash ??= this.passwordHasher.hash(
      crypto.randomBytes(32).toString('hex'),
    );
    return this.dummyPasswordHash;
  }

  private buildVerificationEmailHtml(
    firstName: string,
    token: string,
    userId: string,
  ): string {
    const verifyUrl = `${getAppConfig().frontendUrl}/verify-email?token=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}`;
    return `
      <h1>Welcome to OmniSupport, ${escapeHtml(firstName)}!</h1>
      <p>Please verify your email address to activate your account.</p>
      <a href="${escapeHtml(verifyUrl)}" style="background:#4F46E5;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;">
        Verify Email
      </a>
      <p>This link expires in 24 hours.</p>
    `;
  }

  private buildPasswordResetEmailHtml(firstName: string, token: string): string {
    const resetUrl = `${getAppConfig().frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    return `
      <h1>Reset your password, ${escapeHtml(firstName)}</h1>
      <p>Click the button below to reset your password. This link expires in 1 hour.</p>
      <a href="${escapeHtml(resetUrl)}" style="background:#4F46E5;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;">
        Reset Password
      </a>
      <p>If you didn't request this, please ignore this email.</p>
    `;
  }
}

// Re-export TokenPair type
export type { TokenPair } from './token.service';
