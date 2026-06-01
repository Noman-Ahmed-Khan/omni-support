import { BaseError } from './base.error';

export class UnauthorizedError extends BaseError {
  readonly statusCode = 401;
  readonly errorCode = 'UNAUTHORIZED';

  constructor(message: string = 'Unauthorized') {
    super(message);
  }
}

export class ForbiddenError extends BaseError {
  readonly statusCode = 403;
  readonly errorCode = 'FORBIDDEN';

  constructor(message: string = 'Access denied') {
    super(message);
  }
}

export class TooManyRequestsError extends BaseError {
  readonly statusCode = 429;
  readonly errorCode = 'RATE_LIMIT_EXCEEDED';

  constructor(message: string = 'Too many requests') {
    super(message);
  }
}

export class TenantSuspendedError extends BaseError {
  readonly statusCode = 403;
  readonly errorCode = 'TENANT_SUSPENDED';

  constructor() {
    super('Your organization account has been suspended');
  }
}