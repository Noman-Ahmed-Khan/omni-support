import type { Twilio } from 'twilio';
import twilio from 'twilio';

import type {
  IWhatsAppProvider,
  WhatsAppMessage,
  WhatsAppResult,
  WhatsAppWebhookPayload,
} from './whatsapp-provider.interface';
import { getMessagingConfig } from '../../../config/messaging.config';
import { InfrastructureError } from '../../../shared/errors/infrastructure.error';
import { logger } from '../../../shared/utils/logger.util';

interface TwilioWhatsAppConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  webhookUrl: string;
}

const TWILIO_ACCOUNT_SID_PREFIX = 'AC';

function resolveTwilioConfig(): TwilioWhatsAppConfig | null {
  const whatsappConfig = getMessagingConfig().whatsapp;

  if (!whatsappConfig.provider || whatsappConfig.provider !== 'twilio') {
    logger.warn('Twilio disabled - missing or invalid configuration');
    return null;
  }

  if (
    !whatsappConfig.accountSid ||
    !whatsappConfig.accountSid.startsWith(TWILIO_ACCOUNT_SID_PREFIX) ||
    !whatsappConfig.authToken ||
    !whatsappConfig.fromNumber ||
    !whatsappConfig.webhookUrl
  ) {
    logger.warn('Twilio disabled - missing or invalid configuration');
    return null;
  }

  return {
    accountSid: whatsappConfig.accountSid,
    authToken: whatsappConfig.authToken,
    fromNumber: whatsappConfig.fromNumber,
    webhookUrl: whatsappConfig.webhookUrl.replace(/\/+$/, ''),
  };
}

/** True when the shared (deployment-level) Twilio WhatsApp credentials are complete. */
export function isWhatsAppConfigured(): boolean {
  return resolveTwilioConfig() !== null;
}

export class TwilioWhatsAppProvider implements IWhatsAppProvider {
  private readonly client: Twilio;
  private readonly fromNumber: string;
  private readonly authToken: string;
  private readonly webhookUrl: string;

  constructor(config: TwilioWhatsAppConfig) {
    this.client = twilio(config.accountSid, config.authToken);
    this.fromNumber = config.fromNumber;
    this.authToken = config.authToken;
    this.webhookUrl = config.webhookUrl;

    logger.info('Twilio WhatsApp provider initialized');
  }

  async send(message: WhatsAppMessage): Promise<WhatsAppResult> {
    try {
      const result = await this.client.messages.create({
        from: `whatsapp:${this.fromNumber}`,
        to: `whatsapp:${message.to}`,
        body: message.body,
        mediaUrl: message.mediaUrl ? [message.mediaUrl] : undefined,
      });

      logger.info('WhatsApp message sent', {
        messageId: result.sid,
        to: message.to,
        status: result.status,
      });

      return {
        messageId: result.sid,
        status: result.status,
      };
    } catch (error) {
      logger.error('WhatsApp send failed', { error, to: message.to });
      throw new InfrastructureError('WhatsApp send failed', { error });
    }
  }

  /**
   * Twilio signs the full public URL plus the sorted POST parameters with the account
   * auth token (HMAC-SHA1). The URL comes from configuration, not from request headers,
   * so it is correct behind proxies and cannot be influenced by the caller.
   */
  verifyWebhook(
    signature: string,
    path: string,
    params: Record<string, unknown>,
  ): boolean {
    try {
      return twilio.validateRequest(
        this.authToken,
        signature,
        `${this.webhookUrl}${path}`,
        params,
      );
    } catch {
      return false;
    }
  }

  parseInboundMessage(rawPayload: unknown): WhatsAppWebhookPayload | null {
    try {
      const payload = rawPayload as Record<string, string>;

      if (!payload.From || !payload.Body || !payload.To) return null;

      return {
        from: payload.From.replace('whatsapp:', ''),
        to: payload.To.replace('whatsapp:', ''),
        body: payload.Body,
        messageId: payload.MessageSid ?? '',
        timestamp: payload.Timestamp ?? new Date().toISOString(),
        mediaUrl: payload.MediaUrl0,
      };
    } catch {
      return null;
    }
  }
}

class DisabledWhatsAppProvider implements IWhatsAppProvider {
  constructor() {
    logger.warn('WhatsApp messaging is disabled. Twilio integration is not available.');
  }

  send(_message: WhatsAppMessage): Promise<WhatsAppResult> {
    logger.warn('WhatsApp send skipped because messaging is disabled');
    return Promise.resolve({
      messageId: 'disabled',
      status: 'disabled',
    });
  }

  verifyWebhook(
    _signature: string,
    _path: string,
    _params: Record<string, unknown>,
  ): boolean {
    return false;
  }

  parseInboundMessage(_rawPayload: unknown): WhatsAppWebhookPayload | null {
    return null;
  }
}

export function createWhatsAppProvider(): IWhatsAppProvider {
  const config = resolveTwilioConfig();

  if (!config) {
    // Without complete Twilio configuration (including WHATSAPP_WEBHOOK_URL) all webhook
    // requests are rejected and outbound messages are skipped.
    return new DisabledWhatsAppProvider();
  }

  return new TwilioWhatsAppProvider(config);
}
