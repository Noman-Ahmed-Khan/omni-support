import { getAppConfig } from '../../config/app.config';
import { getJwtConfig } from '../../config/jwt.config';

const MIN_SECRET_LENGTH = 32;

function requireSecret(name: string, value: string | undefined): string {
  if (!value || value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${name} must be set and at least ${MIN_SECRET_LENGTH} characters long`,
    );
  }
  return value;
}

/**
 * Single access point for secrets. There are intentionally no fallback values:
 * a missing secret must fail loudly instead of silently using a public default.
 */
export class SecretsService {
  getJwtAccessSecret(): string {
    return getJwtConfig().accessSecret;
  }

  getJwtRefreshSecret(): string {
    return getJwtConfig().refreshSecret;
  }

  getEncryptionKey(): string {
    return requireSecret('ENCRYPTION_KEY', getAppConfig().encryptionKey);
  }
}
