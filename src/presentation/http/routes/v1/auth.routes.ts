import { Router } from 'express';
import { AuthController } from '../../controllers/auth.controller';
import { validate } from '../../middlewares/validate.middleware';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { authRateLimitMiddleware } from '../../middlewares/rate-limit.middleware';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  refreshTokenSchema,
} from '../../dtos/auth/auth.dto';

export function createAuthRoutes(container: any): Router {
  const router = Router();
  const controller: AuthController = container.resolve('authController');
  const authMiddleware = createAuthMiddleware(
    container.resolve('tokenService'),
  );

  // Public routes with strict rate limiting
  router.post(
    '/register',
    authRateLimitMiddleware,
    validate(registerSchema),
    (req, res, next) => controller.register(req, res, next),
  );

  router.post(
    '/login',
    authRateLimitMiddleware,
    validate(loginSchema),
    (req, res, next) => controller.login(req, res, next),
  );

  router.post(
    '/refresh',
    validate(refreshTokenSchema.partial()),
    (req, res, next) => controller.refresh(req, res, next),
  );

  router.post(
    '/forgot-password',
    authRateLimitMiddleware,
    validate(forgotPasswordSchema),
    (req, res, next) => controller.forgotPassword(req, res, next),
  );

  router.post(
    '/reset-password',
    authRateLimitMiddleware,
    validate(resetPasswordSchema),
    (req, res, next) => controller.resetPassword(req, res, next),
  );

  router.post(
    '/verify-email',
    validate(verifyEmailSchema),
    (req, res, next) => controller.verifyEmail(req, res, next),
  );

  // OAuth routes
  router.get('/google', (req, res) => controller.googleRedirect(req, res));
  router.get('/google/callback', (req, res, next) =>
    controller.googleCallback(req, res, next),
  );

  // Protected routes
  router.post('/logout', authMiddleware, (req, res, next) =>
    controller.logout(req, res, next),
  );

  router.get('/me', authMiddleware, (req, res, next) =>
    controller.me(req, res, next),
  );

  return router;
}