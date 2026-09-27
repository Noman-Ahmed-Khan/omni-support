import crypto from 'crypto';

import type { CookieOptions, Request, Response, NextFunction } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';

import type { ForgotPasswordHandler } from '../../../application/auth/handlers/forgot-password.handler';
import type { LoginHandler } from '../../../application/auth/handlers/login.handler';
import type { LogoutHandler } from '../../../application/auth/handlers/logout.handler';
import type { RefreshTokenHandler } from '../../../application/auth/handlers/refresh-token.handler';
import type { ResetPasswordHandler } from '../../../application/auth/handlers/reset-password.handler';
import type { VerifyEmailHandler } from '../../../application/auth/handlers/verify-email.handler';
import type { OAuthService } from '../../../application/auth/services/oauth.service';
import type { TokenService } from '../../../application/auth/services/token.service';
import { getAppConfig } from '../../../config/app.config';
import { getJwtConfig } from '../../../config/jwt.config';
import { UnauthorizedError } from '../../../shared/errors/application.error';
import type {
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from '../dtos/auth/auth.dto';
import { successResponse } from '../dtos/common/response.dto';

const REFRESH_COOKIE = 'refresh_token';
const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function isProduction(): boolean {
  return getAppConfig().env === 'production';
}

function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'strict',
    maxAge: getJwtConfig().refreshExpiresInMs,
    path: `${getAppConfig().apiPrefix}/auth`,
  };
}

export class AuthController {
  constructor(
    private readonly loginHandler: LoginHandler,
    private readonly refreshTokenHandler: RefreshTokenHandler,
    private readonly logoutHandler: LogoutHandler,
    private readonly verifyEmailHandler: VerifyEmailHandler,
    private readonly forgotPasswordHandler: ForgotPasswordHandler,
    private readonly resetPasswordHandler: ResetPasswordHandler,
    private readonly oauthService: OAuthService,
    private readonly tokenService?: TokenService,
  ) {}

  async login(
    req: Request<ParamsDictionary, unknown, LoginDto, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await this.loginHandler.execute({
        email: req.body.email,
        password: req.body.password,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions());

      res.status(200).json(
        successResponse({
          user: result.user,
          accessToken: result.accessToken,
          expiresIn: result.expiresIn,
        }),
      );
    } catch (error) {
      next(error);
    }
  }

  async refresh(
    req: Request<ParamsDictionary, unknown, Partial<RefreshTokenDto>, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      // Try cookie first, then body
      const refreshToken = getCookie(req, REFRESH_COOKIE) ?? req.body.refreshToken;

      if (!refreshToken) {
        res.status(401).json({
          type: 'https://omnisupport.io/errors/unauthorized',
          title: 'Unauthorized',
          status: 401,
          detail: 'Refresh token not provided',
        });
        return;
      }

      const result = await this.refreshTokenHandler.execute({
        refreshToken,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions());

      res.status(200).json(
        successResponse({
          accessToken: result.accessToken,
          expiresIn: result.expiresIn,
        }),
      );
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = (req.body ?? {}) as Partial<RefreshTokenDto>;
      const refreshToken = getCookie(req, REFRESH_COOKIE) ?? body.refreshToken;

      if (req.user) {
        if (refreshToken) {
          await this.logoutHandler.execute({ refreshToken, userId: req.user.id });
        } else if (this.tokenService) {
          // No session token supplied: revoke every session so logout is never a no-op.
          await this.tokenService.revokeAllUserTokens(req.user.id, 'LOGOUT');
        }
      }

      res.clearCookie(REFRESH_COOKIE, { path: refreshCookieOptions().path });

      res.status(200).json(successResponse({ message: 'Logged out successfully' }));
    } catch (error) {
      next(error);
    }
  }

  async verifyEmail(
    req: Request<ParamsDictionary, unknown, VerifyEmailDto, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      await this.verifyEmailHandler.execute({
        userId: req.body.userId,
        token: req.body.token,
      });

      res.status(200).json(successResponse({ message: 'Email verified successfully' }));
    } catch (error) {
      next(error);
    }
  }

  async forgotPassword(
    req: Request<ParamsDictionary, unknown, ForgotPasswordDto, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      await this.forgotPasswordHandler.execute({ email: req.body.email });

      // Always return 200 to prevent email enumeration
      res.status(200).json(
        successResponse({
          message:
            'If an account exists with this email, you will receive a password reset link.',
        }),
      );
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(
    req: Request<ParamsDictionary, unknown, ResetPasswordDto, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      await this.resetPasswordHandler.execute({
        token: req.body.token,
        password: req.body.password,
        ipAddress: req.ip,
      });

      res.status(200).json(successResponse({ message: 'Password reset successfully' }));
    } catch (error) {
      next(error);
    }
  }

  googleRedirect(_req: Request, res: Response): void {
    const state = this.oauthService.createState();

    res.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: isProduction(),
      // "lax" so the cookie is sent on the top-level redirect back from Google.
      sameSite: 'lax',
      maxAge: OAUTH_STATE_TTL_MS,
      path: `${getAppConfig().apiPrefix}/auth/google`,
    });

    res.redirect(this.oauthService.getGoogleAuthUrl(state));
  }

  async googleCallback(
    req: Request<ParamsDictionary, unknown, unknown, ParsedQs>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const code = firstQueryValue(req.query.code);
      const state = firstQueryValue(req.query.state);
      const expectedState = getCookie(req, OAUTH_STATE_COOKIE);

      res.clearCookie(OAUTH_STATE_COOKIE, {
        path: `${getAppConfig().apiPrefix}/auth/google`,
      });

      if (!code || !state || !expectedState || !safeEqual(state, expectedState)) {
        throw new UnauthorizedError('Invalid OAuth state');
      }

      const result = await this.oauthService.handleGoogleCallback(
        code,
        req.ip,
        req.headers['user-agent'],
      );

      // The session is carried by the httpOnly refresh cookie; the frontend exchanges it
      // for an access token via POST /auth/refresh, so no token appears in the URL.
      res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions());

      res.redirect(
        `${getAppConfig().frontendUrl}/auth/callback?isNew=${result.isNewUser ? 'true' : 'false'}`,
      );
    } catch (error) {
      next(error);
    }
  }

  me(req: Request, res: Response, _next: NextFunction): void {
    res.status(200).json(successResponse(req.user));
  }
}

function firstQueryValue(value: unknown): string | undefined {
  const first: unknown = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' && first.length > 0 ? first : undefined;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function getCookie(req: unknown, name: string): string | undefined {
  const cookies = (
    req as {
      cookies?: Record<string, string | undefined>;
    }
  ).cookies;

  return cookies?.[name];
}
