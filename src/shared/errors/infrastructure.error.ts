import { BaseError } from './base.error';

export class InfrastructureError extends BaseError {
  readonly statusCode = 500;
  readonly errorCode = 'INFRASTRUCTURE_ERROR';

  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context, false);
  }
}