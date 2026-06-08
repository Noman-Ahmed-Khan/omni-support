import type { PrismaClient } from '@prisma/client';

import { ForgotPasswordHandler } from '../../../application/auth/handlers/forgot-password.handler';
import { LoginHandler } from '../../../application/auth/handlers/login.handler';
import { LogoutHandler } from '../../../application/auth/handlers/logout.handler';
import { RefreshTokenHandler } from '../../../application/auth/handlers/refresh-token.handler';
import { RegisterHandler } from '../../../application/auth/handlers/register.handler';
import { ResetPasswordHandler } from '../../../application/auth/handlers/reset-password.handler';
import { VerifyEmailHandler } from '../../../application/auth/handlers/verify-email.handler';
import { AuthService } from '../../../application/auth/services/auth.service';
import { OAuthService } from '../../../application/auth/services/oauth.service';
import type { TokenService } from '../../../application/auth/services/token.service';
import { AuthController } from '../../../presentation/http/controllers/auth.controller';
import type { CacheService } from '../../cache/cache.service';
import type { AuditRepository } from '../../database/repositories/audit.repository';
import type { EmailQueue } from '../../queue/queues/email.queue';
import { PasswordHasher } from '../../security/password-hasher';
import type { Container } from '../index';

export function registerAuthModule(container: Container): void {
  const prisma = container.resolve<PrismaClient>('prisma');
  const tokenService = container.resolve<TokenService>('tokenService');
  const emailQueue = container.resolve<EmailQueue>('emailQueue');
  const auditRepo = container.resolve<AuditRepository>('auditRepo');
  const cacheService = container.resolve<CacheService>('cacheService');

  const authService = new AuthService(
    prisma,
    tokenService,
    emailQueue,
    auditRepo,
    cacheService,
    new PasswordHasher(),
  );
  container.register('authService', authService);

  const oauthService = new OAuthService(prisma, tokenService);
  container.register('oauthService', oauthService);

  // Handlers
  container.register('registerHandler', new RegisterHandler(authService));
  container.register('loginHandler', new LoginHandler(authService));
  container.register('refreshTokenHandler', new RefreshTokenHandler(authService));
  container.register('logoutHandler', new LogoutHandler(authService));
  container.register('verifyEmailHandler', new VerifyEmailHandler(authService));
  container.register('forgotPasswordHandler', new ForgotPasswordHandler(authService));
  container.register('resetPasswordHandler', new ResetPasswordHandler(authService));

  container.register(
    'authController',
    new AuthController(
      container.resolve('registerHandler'),
      container.resolve('loginHandler'),
      container.resolve('refreshTokenHandler'),
      container.resolve('logoutHandler'),
      container.resolve('verifyEmailHandler'),
      container.resolve('forgotPasswordHandler'),
      container.resolve('resetPasswordHandler'),
      oauthService,
    ),
  );
}
