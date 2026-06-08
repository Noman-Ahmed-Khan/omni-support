import type { IncomingMessage } from 'http';
import { parse } from 'url';

import type { Request } from 'express';

export function extractBearerTokenFromHeader(authHeader?: string): string | null {
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

export function extractBearerTokenFromRequest(req: Request): string | null {
  return extractBearerTokenFromHeader(req.headers.authorization);
}

export function extractBearerTokenFromWebSocketRequest(
  request: IncomingMessage,
): string | null {
  const query = parse(request.url ?? '', true).query;
  if (query?.token && typeof query.token === 'string') {
    return query.token;
  }

  const authHeader = request.headers.authorization;
  if (typeof authHeader === 'string') {
    const token = extractBearerTokenFromHeader(authHeader);
    if (token) {
      return token;
    }
  }

  const cookies = parseCookies(request.headers.cookie ?? '');
  return cookies['access_token'] ?? null;
}

function parseCookies(cookieHeader: string): Record<string, string> {
  return cookieHeader.split(';').reduce(
    (acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      if (key) acc[key.trim()] = value?.trim() ?? '';
      return acc;
    },
    {} as Record<string, string>,
  );
}
