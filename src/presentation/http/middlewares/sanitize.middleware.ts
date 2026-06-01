import { Request, Response, NextFunction } from 'express';

// Recursively sanitize string values to prevent XSS
function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value !== null && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      sanitized[key] = sanitizeValue(val);
    }
    return sanitized;
  }

  return value;
}

export function sanitizeMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  // Only sanitize query params - body content should preserve formatting
  // for ticket descriptions, comments etc.
  // Use parameterized queries (Prisma) for SQL injection protection
  if (req.query) {
    req.query = sanitizeValue(req.query) as any;
  }

  // Sanitize specific dangerous headers
  const dangerousHeaders = ['x-forwarded-host', 'x-original-url'];
  dangerousHeaders.forEach((header) => {
    if (req.headers[header]) {
      delete req.headers[header];
    }
  });

  next();
}