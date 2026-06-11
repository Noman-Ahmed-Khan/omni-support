import { z } from 'zod';

const messagingConfigSchema = z.object({
  email: z.object({
    provider: z.enum(['smtp', 'ses']).default('smtp'),
    from: z.string().email(),
  }),
  smtp: z.object({
    host: z.string(),
    port: z.coerce.number().default(587),
    user: z.string(),
    password: z.string(),
  }),
  whatsapp: z
    .object({
      provider: z.enum(['twilio']).optional(),
      accountSid: z.string().optional(),
      authToken: z.string().optional(),
      fromNumber: z.string().optional(),
      webhookSecret: z.string().optional(),
    })
    .default({}),
});

export type MessagingConfig = z.infer<typeof messagingConfigSchema>;

let _messagingConfig: MessagingConfig | null = null;

/**
 * Returns the validated messaging configuration (SMTP, WhatsApp).
 * Config is parsed lazily on first access so that importing this module
 * does NOT trigger environment variable validation at module load time.
 * This keeps unit tests free of infrastructure coupling.
 */
export function getMessagingConfig(): MessagingConfig {
  if (!_messagingConfig) {
    _messagingConfig = messagingConfigSchema.parse({
      email: {
        provider: process.env.EMAIL_PROVIDER,
        from: process.env.EMAIL_FROM,
      },
      smtp: {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        user: process.env.SMTP_USER,
        password: process.env.SMTP_PASSWORD,
      },
      whatsapp: {
        provider: process.env.WHATSAPP_PROVIDER,
        accountSid: process.env.WHATSAPP_ACCOUNT_SID,
        authToken: process.env.WHATSAPP_AUTH_TOKEN,
        fromNumber: process.env.WHATSAPP_FROM_NUMBER,
        webhookSecret: process.env.WHATSAPP_WEBHOOK_SECRET,
      },
    });
  }
  return _messagingConfig;
}

/** @internal For testing — resets the singleton so tests can override env vars. */
export function _resetMessagingConfig(): void {
  _messagingConfig = null;
}
