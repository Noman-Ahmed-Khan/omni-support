export class SecretsService {
  getJwtAccessSecret(): string {
    return process.env.JWT_ACCESS_SECRET ?? 'development_access_secret_change_me';
  }

  getJwtRefreshSecret(): string {
    return process.env.JWT_REFRESH_SECRET ?? 'development_refresh_secret_change_me';
  }

  getEncryptionKey(): string {
    return (
      process.env.ENCRYPTION_KEY ??
      process.env.LOCAL_STORAGE_SECRET ??
      'development_encryption_secret_change_me'
    );
  }

  getWebhookSecret(): string {
    return process.env.WHATSAPP_WEBHOOK_SECRET ?? 'development_webhook_secret_change_me';
  }
}
