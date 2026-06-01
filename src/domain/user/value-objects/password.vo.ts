import { ValidationError } from '../../../shared/errors/domain.error';

export class Password {
  private constructor(private readonly value: string) {}

  static create(plainText: string): Password {
    const errors: string[] = [];

    if (plainText.length < 8) {
      errors.push('Password must be at least 8 characters');
    }
    if (!/[A-Z]/.test(plainText)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(plainText)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[0-9]/.test(plainText)) {
      errors.push('Password must contain at least one number');
    }
    if (!/[^A-Za-z0-9]/.test(plainText)) {
      errors.push('Password must contain at least one special character');
    }

    if (errors.length > 0) {
      throw new ValidationError('Password does not meet requirements', {
        password: errors,
      });
    }

    return new Password(plainText);
  }

  toString(): string {
    return this.value;
  }
}
