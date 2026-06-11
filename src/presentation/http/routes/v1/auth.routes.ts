import { Router } from 'express';

import type { Container } from '../../../../infrastructure/di';
import type { AuthController } from '../../controllers/auth.controller';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  refreshTokenSchema,
} from '../../dtos/auth/auth.dto';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { createAuthRateLimitMiddleware } from '../../middlewares/rate-limit.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';

export function createAuthRoutes(container: Container): Router {
  const router = Router();
  const controller: AuthController = container.resolve('authController');
  const authMiddleware = createAuthMiddleware(container.resolve('tokenService'));
  const authRateLimitMiddleware = createAuthRateLimitMiddleware();

  // Public routes with strict rate limiting
  router.post(
    '/register',
    authRateLimitMiddleware,
    validate(registerSchema),
    asyncHandler((req, res, next) => controller.register(req, res, next)),
  );

  router.post(
    '/login',
    authRateLimitMiddleware,
    validate(loginSchema),
    asyncHandler((req, res, next) => controller.login(req, res, next)),
  );

  router.post(
    '/refresh',
    validate(refreshTokenSchema.partial()),
    asyncHandler((req, res, next) => controller.refresh(req, res, next)),
  );

  router.post(
    '/forgot-password',
    authRateLimitMiddleware,
    validate(forgotPasswordSchema),
    asyncHandler((req, res, next) => controller.forgotPassword(req, res, next)),
  );

  router.post(
    '/reset-password',
    authRateLimitMiddleware,
    validate(resetPasswordSchema),
    asyncHandler((req, res, next) => controller.resetPassword(req, res, next)),
  );

  router.post(
    '/verify-email',
    validate(verifyEmailSchema),
    asyncHandler((req, res, next) => controller.verifyEmail(req, res, next)),
  );

  // OAuth routes
  router.get('/google', (req, res) => controller.googleRedirect(req, res));
  router.get(
    '/google/callback',
    asyncHandler((req, res, next) => controller.googleCallback(req, res, next)),
  );

  // Protected routes
  router.post(
    '/logout',
    authMiddleware,
    asyncHandler((req, res, next) => controller.logout(req, res, next)),
  );

  router.get('/me', authMiddleware, (req, res, next) => controller.me(req, res, next));

  return router;
}
