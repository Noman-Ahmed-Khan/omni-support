import crypto from 'crypto';

import type { Request, Response, NextFunction } from 'express';

const SAFE_CORRELATION_ID = /^[A-Za-z0-9-]{1,64}$/;

export function correlationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Client-supplied ids end up in logs, so only accept short, safe values.
  const supplied = req.headers['x-correlation-id'];
  const correlationId =
    typeof supplied === 'string' && SAFE_CORRELATION_ID.test(supplied)
      ? supplied
      : crypto.randomUUID();

  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);

  next();
}
