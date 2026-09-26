import crypto from 'crypto';

import type { PrismaClient, User } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';

import type { TokenService } from './token.service';
import { getAppConfig } from '../../../config/app.config';
import { getOAuthConfig } from '../../../config/oauth.config';
import {
  ForbiddenError,
  UnauthorizedError,
} from '../../../shared/errors/application.error';
import { logger } from '../../../shared/utils/logger.util';

export interface GoogleUserInfo {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  emailVerified: boolean;
}

export class OAuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly tokenService: TokenService,
  ) {
    const { google } = getOAuthConfig();
    this.googleClient = new OAuth2Client(
      google.clientId,
      google.clientSecret,
      google.callbackUrl,
    );
  }

  /** Creates an unguessable value used to bind the OAuth callback to the browser that started it. */
  createState(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  getGoogleAuthUrl(state: string): string {
    return this.googleClient.generateAuthUrl({
      access_type: 'online',
      scope: ['profile', 'email'],
      state,
    });
  }

  async handleGoogleCallback(
    code: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    isNewUser: boolean;
    user: User;
  }> {
    // Exchange code for tokens
    const { tokens } = await this.googleClient.getToken(code);

    if (!tokens.id_token) {
      throw new UnauthorizedError('Google did not return an identity token');
    }

    const ticket = await this.googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: getOAuthConfig().google.clientId,
    });

    const payload = ticket.getPayload();
    if (!payload?.email) throw new UnauthorizedError('Invalid Google token payload');

    const googleUser: GoogleUserInfo = {
      googleId: payload.sub,
      email: payload.email,
      firstName: payload.given_name ?? '',
      lastName: payload.family_name ?? '',
      avatarUrl: payload.picture,
      emailVerified: payload.email_verified ?? false,
    };

    if (!googleUser.emailVerified) {
      throw new ForbiddenError('Your Google email address is not verified');
    }

    const { user, isNewUser } = await this.findOrCreateGoogleUser(googleUser);

    await this.tokenService.assertAccountUsable(user);

    const tokenPair = await this.tokenService.createTokenPair(
      user.id,
      {
        tenantId: user.tenantId ?? undefined,
        role: user.role,
        email: user.email,
      },
      ipAddress,
      userAgent,
    );

    logger.info('Google OAuth login', {
      userId: user.id,
      isNewUser,
    });

    return { ...tokenPair, isNewUser, user };
  }

  private async findOrCreateGoogleUser(
    googleUser: GoogleUserInfo,
  ): Promise<{ user: User; isNewUser: boolean }> {
    // Google API tokens are not needed after sign-in, so they are never persisted.
    const existingOAuth = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUid: {
          provider: 'google',
          providerUid: googleUser.googleId,
        },
      },
      include: { user: true },
    });

    if (existingOAuth) {
      return { user: existingOAuth.user, isNewUser: false };
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: googleUser.email.toLowerCase() },
    });

    if (existingUser) {
      // Only link when Google has verified ownership of the email (checked by the caller).
      await this.prisma.oAuthAccount.create({
        data: {
          userId: existingUser.id,
          provider: 'google',
          providerUid: googleUser.googleId,
        },
      });

      return { user: existingUser, isNewUser: false };
    }

    if (!getAppConfig().allowPublicRegistration) {
      throw new ForbiddenError('No account exists for this Google identity');
    }

    // Self sign-up creates a tenant-less customer without staff privileges.
    const newUser = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: crypto.randomUUID(),
          email: googleUser.email.toLowerCase(),
          firstName: googleUser.firstName,
          lastName: googleUser.lastName,
          role: 'CUSTOMER',
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
          avatarUrl: googleUser.avatarUrl,
        },
      });

      await tx.oAuthAccount.create({
        data: {
          userId: user.id,
          provider: 'google',
          providerUid: googleUser.googleId,
        },
      });

      return user;
    });

    return { user: newUser, isNewUser: true };
  }
}
