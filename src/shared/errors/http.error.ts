import { BaseError } from './base.error';

export class HttpError extends BaseError {
  readonly statusCode: number;
  readonly errorCode: string;

  constructor(
    statusCode: number,
    errorCode: string,
    message: string,
    context?: Record<string, unknown>,
  ) {
    super(message, context);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}
