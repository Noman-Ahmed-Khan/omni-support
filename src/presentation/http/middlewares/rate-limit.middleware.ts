import type { Request, RequestHandler } from 'express';
import createRateLimit from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';

import { getAppConfig } from '../../../config/app.config';
import { getRedisClient } from '../../../infrastructure/cache/redis.client';

const isTestEnv = (): boolean => getAppConfig().env === 'test';

const redisSendCommand = (...args: string[]): Promise<RedisReply> =>
  getRedisClient().sendCommand(args);

const createNoopMiddleware = (): RequestHandler => (_req, _res, next) => next();

interface LimiterOptions {
  /** Separates counters of different limiters in Redis. */
  prefix: string;
  windowMs: number;
  max: number;
  keyGenerator: (req: Request) => string;
  title: string;
  detail: string;
}

function createLimiter(options: LimiterOptions): RequestHandler {
  if (isTestEnv()) {
    return createNoopMiddleware();
  }

  return createRateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: options.keyGenerator,
    handler: (_req, res) => {
      res.status(429).json({
        type: 'https://omnisupport.io/errors/rate-limit',
        title: options.title,
        status: 429,
        detail: options.detail,
      });
    },
    store: new RedisStore({
      sendCommand: redisSendCommand,
      prefix: `rl:${options.prefix}:`,
    }),
  });
}

export function createRateLimitMiddleware(): RequestHandler {
  return createLimiter({
    prefix: 'global',
    windowMs: getAppConfig().rateLimitWindowMs,
    max: getAppConfig().rateLimitMaxRequests,
    // Runs before authentication, so this is a per-client-IP limit.
    keyGenerator: (req) => req.ip ?? 'unknown',
    title: 'Too Many Requests',
    detail: 'Rate limit exceeded. Please slow down.',
  });
}

export function createAuthRateLimitMiddleware(): RequestHandler {
  return createLimiter({
    prefix: 'auth',
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => req.ip ?? 'unknown',
    title: 'Too Many Auth Attempts',
    detail: 'Too many authentication attempts. Please wait 15 minutes.',
  });
}

/**
 * Limits login attempts per target account regardless of client IP, so a password
 * cannot be guessed from many addresses.
 */
export function createLoginAccountRateLimitMiddleware(): RequestHandler {
  return createLimiter({
    prefix: 'login-account',
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => {
      const email = (req.body as { email?: unknown } | undefined)?.email;
      return typeof email === 'string'
        ? email.trim().toLowerCase()
        : (req.ip ?? 'unknown');
    },
    title: 'Too Many Auth Attempts',
    detail: 'Too many sign-in attempts for this account. Please wait 15 minutes.',
  });
}

/** For token refresh and email verification, which clients call more often than login. */
export function createSessionRateLimitMiddleware(): RequestHandler {
  return createLimiter({
    prefix: 'session',
    windowMs: 15 * 60 * 1000,
    max: 60,
    keyGenerator: (req) => req.ip ?? 'unknown',
    title: 'Too Many Requests',
    detail: 'Too many requests. Please wait before retrying.',
  });
}

export function createAIRateLimitMiddleware(): RequestHandler {
  return createLimiter({
    prefix: 'ai',
    windowMs: 60 * 1000,
    max: 20,
    keyGenerator: (req) => req.user?.tenantId ?? req.ip ?? 'unknown',
    title: 'AI Rate Limit Exceeded',
    detail: 'AI request limit exceeded. Please wait before retrying.',
  });
}
