import jwt, { SignOptions } from 'jsonwebtoken';

export class TokenSigningService {
  sign<TPayload extends object>(
    payload: TPayload,
    secret: string,
    options: SignOptions,
  ): string {
    return jwt.sign(payload, secret, options);
  }

  verify<TPayload extends object>(
    token: string,
    secret: string,
    options?: jwt.VerifyOptions,
  ): TPayload {
    return jwt.verify(token, secret, options) as TPayload;
  }
}
