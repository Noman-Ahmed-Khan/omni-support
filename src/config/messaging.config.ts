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
  whatsapp: z.object({
    provider: z.enum(['twilio']).default('twilio'),
    accountSid: z.string(),
    authToken: z.string(),
    fromNumber: z.string(),
    webhookSecret: z.string(),
  }),
});

export const messagingConfig = messagingConfigSchema.parse({
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