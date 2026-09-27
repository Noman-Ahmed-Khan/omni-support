import { getAIConfig } from '../../../config/ai.config';
import { getMessagingConfig } from '../../../config/messaging.config';
import { getOAuthConfig } from '../../../config/oauth.config';
import { getStorageConfig } from '../../../config/storage.config';
import type { IEmailProvider } from '../../../infrastructure/messaging/email/email-provider.interface';
import type { IStorageProvider } from '../../../infrastructure/storage/storage-provider.interface';

export interface ProviderStatus {
  configured: boolean;
  health: 'ok' | 'error' | 'not_checked';
  detail?: string;
  settings: Record<string, string | number | boolean | null>;
}

const CHECK_TIMEOUT_MS = 5_000;

function safe<T>(read: () => T): T | null {
  try {
    return read();
  } catch {
    return null;
  }
}

async function check(
  run: () => Promise<unknown>,
): Promise<Pick<ProviderStatus, 'health' | 'detail'>> {
  try {
    await Promise.race([
      run(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Health check timed out')),
          CHECK_TIMEOUT_MS,
        ).unref(),
      ),
    ]);
    return { health: 'ok' };
  } catch (error) {
    return {
      health: 'error',
      detail: error instanceof Error ? error.message : 'Health check failed',
    };
  }
}

/** Last four characters only, for recognising which credential is deployed. */
function fingerprint(value: string | undefined | null): string | null {
  return value && value.length > 8 ? `…${value.slice(-4)}` : value ? 'set' : null;
}

/**
 * Redacted status of the shared, deployment-configured providers (storage, email,
 * WhatsApp, Google OAuth, AI). Secrets are never returned; only whether they are set.
 */
export class ProviderStatusService {
  constructor(
    private readonly storage: IStorageProvider,
    private readonly emailProvider: Pick<IEmailProvider, 'verify'>,
    private readonly whatsappConfigured: () => boolean,
  ) {}

  async getStatus(options: {
    checkHealth: boolean;
  }): Promise<Record<string, ProviderStatus>> {
    const storageConfig = safe(() => getStorageConfig());
    const messaging = safe(() => getMessagingConfig());
    const oauth = safe(() => getOAuthConfig());
    const ai = safe(() => getAIConfig());

    const storage: ProviderStatus = {
      configured: !!storageConfig,
      health: 'not_checked',
      settings: {
        provider: storageConfig?.provider ?? null,
        bucket: storageConfig?.aws?.bucket ?? null,
        region: storageConfig?.aws?.region ?? null,
      },
    };
    const email: ProviderStatus = {
      configured: !!messaging?.smtp.host && !!messaging.email.from,
      health: 'not_checked',
      settings: {
        host: messaging?.smtp.host ?? null,
        port: messaging?.smtp.port ?? null,
        from: messaging?.email.from ?? null,
        passwordSet: !!messaging?.smtp.password,
      },
    };
    const whatsapp: ProviderStatus = {
      configured: this.whatsappConfigured(),
      health: 'not_checked',
      settings: {
        provider: messaging?.whatsapp.provider ?? null,
        accountSid: fingerprint(messaging?.whatsapp.accountSid),
        authTokenSet: !!messaging?.whatsapp.authToken,
        webhookUrl: messaging?.whatsapp.webhookUrl ?? null,
      },
    };
    const google: ProviderStatus = {
      configured: !!oauth?.google.clientId && !!oauth.google.clientSecret,
      health: 'not_checked',
      settings: {
        clientId: fingerprint(oauth?.google.clientId),
        clientSecretSet: !!oauth?.google.clientSecret,
        callbackUrl: oauth?.google.callbackUrl ?? null,
      },
    };
    const aiStatus: ProviderStatus = {
      configured: !!ai?.openaiApiKey,
      health: 'not_checked',
      settings: { provider: ai?.provider ?? null, apiKeySet: !!ai?.openaiApiKey },
    };

    if (options.checkHealth) {
      const [storageHealth, emailHealth] = await Promise.all([
        check(() => this.storage.exists('health/probe')),
        email.configured
          ? check(async () => {
              if (!(await this.emailProvider.verify())) {
                throw new Error('SMTP server rejected the connection');
              }
            })
          : Promise.resolve({ health: 'error' as const, detail: 'Not configured' }),
      ]);
      Object.assign(storage, storageHealth);
      Object.assign(email, emailHealth);
    }

    return { storage, email, whatsapp, google, ai: aiStatus };
  }
}
