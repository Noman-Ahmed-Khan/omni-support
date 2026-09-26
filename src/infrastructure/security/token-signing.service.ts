import type { SignOptions } from 'jsonwebtoken';
import jwt from 'jsonwebtoken';

import { JWT_ALGORITHM } from '../../config/jwt.config';

export class TokenSigningService {
  sign<TPayload extends object>(
    payload: TPayload,
    secret: string,
    options: SignOptions,
  ): string {
    return jwt.sign(payload, secret, { algorithm: JWT_ALGORITHM, ...options });
  }

  verify<TPayload extends object>(
    token: string,
    secret: string,
    options?: jwt.VerifyOptions,
  ): TPayload {
    // Pin the algorithm so tokens signed with any other algorithm are rejected.
    return jwt.verify(token, secret, {
      ...options,
      algorithms: [JWT_ALGORITHM],
    }) as TPayload;
  }
}
