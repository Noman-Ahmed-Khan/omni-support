import type { Request, Response, NextFunction } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';

import type { ForgotPasswordHandler } from '../../../application/auth/handlers/forgot-password.handler';
import type { LoginHandler } from '../../../application/auth/handlers/login.handler';
import type { LogoutHandler } from '../../../application/auth/handlers/logout.handler';
import type { RefreshTokenHandler } from '../../../application/auth/handlers/refresh-token.handler';
import type { RegisterHandler } from '../../../application/auth/handlers/register.handler';
import type { ResetPasswordHandler } from '../../../application/auth/handlers/reset-password.handler';
import type { VerifyEmailHandler } from '../../../application/auth/handlers/verify-email.handler';
import type { OAuthService } from '../../../application/auth/services/oauth.service';
import type {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from '../dtos/auth/auth.dto';
import { successResponse } from '../dtos/common/response.dto';

export class AuthController {
  constructor(
    private readonly registerHandler: RegisterHandler,
    private readonly loginHandler: LoginHandler,
    private readonly refreshTokenHandler: RefreshTokenHandler,
    private readonly logoutHandler: LogoutHandler,
    private readonly verifyEmailHandler: VerifyEmailHandler,
    private readonly forgotPasswordHandler: ForgotPasswordHandler,
    private readonly resetPasswordHandler: ResetPasswordHandler,
    private readonly oauthService: OAuthService,
  ) {}

  async register(
    req: Request<ParamsDictionary, unknown, RegisterDto, unknown>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await this.registerHandler.execute({
        email: req.body.email,
        password: req.body.password,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
      });

      res.status(201).json(successResponse(result, undefined));
    } catch (error) {
      next(error);
    }
  }

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

      // Set refresh token as HTTP-only cookie
      res.cookie('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        path: '/api/v1/auth/refresh',
      });

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
      const refreshToken = getCookie(req, 'refresh_token') ?? req.body.refreshToken;

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

      // Rotate cookie
      res.cookie('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/api/v1/auth/refresh',
      });

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
      const body = req.body as Partial<RefreshTokenDto>;
      const refreshToken = getCookie(req, 'refresh_token') ?? body.refreshToken;

      if (refreshToken && req.user) {
        await this.logoutHandler.execute({ refreshToken, userId: req.user.id });
      }

      res.clearCookie('refresh_token', { path: '/api/v1/auth/refresh' });

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
    const url = this.oauthService.getGoogleAuthUrl();
    res.redirect(url);
  }

  async googleCallback(
    req: Request<ParamsDictionary, unknown, unknown, ParsedQs>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const rawCode = req.query.code;
      const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;

      const result = await this.oauthService.handleGoogleCallback(
        String(code),
        req.ip,
        req.headers['user-agent'],
      );

      res.cookie('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/api/v1/auth/refresh',
      });

      // Redirect to frontend with access token
      res.redirect(
        `${process.env.FRONTEND_URL}/auth/callback?token=${result.accessToken}&isNew=${result.isNewUser}`,
      );
    } catch (error) {
      next(error);
    }
  }

  me(req: Request, res: Response, _next: NextFunction): void {
    res.status(200).json(successResponse(req.user));
  }
}

function getCookie(req: unknown, name: string): string | undefined {
  const cookies = (
    req as {
      cookies?: Record<string, string | undefined>;
    }
  ).cookies;

  return cookies?.[name];
}
