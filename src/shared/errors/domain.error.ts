import { BaseError } from './base.error';

export class DomainError extends BaseError {
  readonly statusCode = 422;
  readonly errorCode: string;

  constructor(message: string, errorCode: string = 'DOMAIN_ERROR') {
    super(message, {}, true);
    this.errorCode = errorCode;
  }
}

export class NotFoundError extends BaseError {
  readonly statusCode = 404;
  readonly errorCode = 'NOT_FOUND';

  constructor(resource: string, id?: string) {
    super(id ? `${resource} with id '${id}' not found` : `${resource} not found`);
  }
}

export class ConflictError extends BaseError {
  readonly statusCode = 409;
  readonly errorCode = 'CONFLICT';

  constructor(message: string) {
    super(message);
  }
}

export class ValidationError extends BaseError {
  readonly statusCode = 400;
  readonly errorCode = 'VALIDATION_ERROR';
  readonly errors: Record<string, string[]>;

  constructor(message: string, errors: Record<string, string[]> = {}) {
    super(message, { errors });
    this.errors = errors;
  }
}
