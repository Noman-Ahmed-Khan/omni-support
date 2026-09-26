import type { Request, Response, NextFunction } from 'express';

/**
 * Strips proxy headers that could be used to spoof the request target.
 *
 * Input is not HTML-escaped here: request data is stored as submitted and escaped where
 * it is rendered (see shared/utils/html.util.ts for email templates). Escaping query
 * strings used to corrupt search terms such as "it's".
 */
export function sanitizeMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const dangerousHeaders = ['x-forwarded-host', 'x-original-url'];
  dangerousHeaders.forEach((header) => {
    if (req.headers[header]) {
      delete req.headers[header];
    }
  });

  next();
}
