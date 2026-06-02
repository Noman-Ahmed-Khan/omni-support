import rateLimit from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { getRedisClient } from '../../../infrastructure/cache/redis.client';

const redisSendCommand = (...args: string[]): Promise<RedisReply> =>
  getRedisClient().sendCommand(args);

// Global rate limit
export const rateLimitMiddleware = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW ?? '60000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '100'),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit per tenant + IP
    const tenantId = req.user?.tenantId ?? 'anonymous';
    return `${tenantId}:${req.ip}`;
  },
  handler: (_req, res) => {
    res.status(429).json({
      type: 'https://omnisupport.io/errors/rate-limit',
      title: 'Too Many Requests',
      status: 429,
      detail: 'Rate limit exceeded. Please slow down.',
    });
  },
  store: new RedisStore({
    sendCommand: redisSendCommand,
  }),
});

// Strict rate limit for auth endpoints
export const authRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `auth:${req.ip}`,
  handler: (_req, res) => {
    res.status(429).json({
      type: 'https://omnisupport.io/errors/rate-limit',
      title: 'Too Many Auth Attempts',
      status: 429,
      detail:
        'Too many authentication attempts. Please wait 15 minutes.',
    });
  },
  store: new RedisStore({
    sendCommand: redisSendCommand,
  }),
});

// AI endpoint rate limit (expensive operations)
export const aiRateLimitMiddleware = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `ai:${req.user?.tenantId ?? req.ip}`,
  handler: (_req, res) => {
    res.status(429).json({
      type: 'https://omnisupport.io/errors/rate-limit',
      title: 'AI Rate Limit Exceeded',
      status: 429,
      detail: 'AI request limit exceeded. Please wait before retrying.',
    });
  },
});
