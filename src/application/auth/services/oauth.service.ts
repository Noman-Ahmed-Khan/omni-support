import { OAuth2Client, type Credentials } from 'google-auth-library';
import crypto from 'crypto';
import { PrismaClient, User } from '@prisma/client';
import { TokenService } from './token.service';
import { logger } from '../../../shared/utils/logger.util';

export interface GoogleUserInfo {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  emailVerified: boolean;
}

export type GoogleTokens = Credentials;

export class OAuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly tokenService: TokenService,
  ) {
    this.googleClient = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_CALLBACK_URL,
    );
  }

  getGoogleAuthUrl(state?: string): string {
    return this.googleClient.generateAuthUrl({
      access_type: 'offline',
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
    this.googleClient.setCredentials(tokens);

    // Get user info
    const ticket = await this.googleClient.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) throw new Error('Invalid Google token payload');

    const googleUser: GoogleUserInfo = {
      googleId: payload.sub,
      email: payload.email!,
      firstName: payload.given_name ?? '',
      lastName: payload.family_name ?? '',
      avatarUrl: payload.picture,
      emailVerified: payload.email_verified ?? false,
    };

    // Find or create user
    const { user, isNewUser } = await this.findOrCreateGoogleUser(googleUser, tokens);

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
      email: user.email,
      isNewUser,
    });

    return { ...tokenPair, isNewUser, user };
  }

  private async findOrCreateGoogleUser(
    googleUser: GoogleUserInfo,
    tokens: GoogleTokens,
  ): Promise<{ user: User; isNewUser: boolean }> {
    // Check existing OAuth account
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
      // Update tokens
      await this.prisma.oAuthAccount.update({
        where: { id: existingOAuth.id },
        data: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? existingOAuth.refreshToken,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        },
      });

      return { user: existingOAuth.user, isNewUser: false };
    }

    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: googleUser.email.toLowerCase() },
    });

    if (existingUser) {
      // Link OAuth to existing account
      await this.prisma.oAuthAccount.create({
        data: {
          userId: existingUser.id,
          provider: 'google',
          providerUid: googleUser.googleId,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        },
      });

      return { user: existingUser, isNewUser: false };
    }

    // Create new user
    const newUser = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: crypto.randomUUID(),
          email: googleUser.email.toLowerCase(),
          firstName: googleUser.firstName,
          lastName: googleUser.lastName,
          role: 'AGENT',
          status: googleUser.emailVerified ? 'ACTIVE' : 'PENDING_VERIFICATION',
          emailVerifiedAt: googleUser.emailVerified ? new Date() : undefined,
          avatarUrl: googleUser.avatarUrl,
        },
      });

      await tx.oAuthAccount.create({
        data: {
          userId: user.id,
          provider: 'google',
          providerUid: googleUser.googleId,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        },
      });

      return user;
    });

    return { user: newUser, isNewUser: true };
  }
}
