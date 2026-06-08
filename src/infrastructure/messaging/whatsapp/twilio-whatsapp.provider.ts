import crypto from 'crypto';

import type { Twilio } from 'twilio';
import twilio from 'twilio';

import type {
  IWhatsAppProvider,
  WhatsAppMessage,
  WhatsAppResult,
  WhatsAppWebhookPayload,
} from './whatsapp-provider.interface';
import { messagingConfig } from '../../../config/messaging.config';
import { InfrastructureError } from '../../../shared/errors/infrastructure.error';
import { logger } from '../../../shared/utils/logger.util';

export class TwilioWhatsAppProvider implements IWhatsAppProvider {
  private readonly client: Twilio;
  private readonly fromNumber: string;
  private readonly webhookSecret: string;

  constructor() {
    this.client = twilio(
      messagingConfig.whatsapp.accountSid,
      messagingConfig.whatsapp.authToken,
    );
    this.fromNumber = messagingConfig.whatsapp.fromNumber;
    this.webhookSecret = messagingConfig.whatsapp.webhookSecret;
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

  verifyWebhook(signature: string, payload: string): boolean {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );
    } catch {
      return false;
    }
  }

  parseInboundMessage(rawPayload: unknown): WhatsAppWebhookPayload | null {
    try {
      const payload = rawPayload as Record<string, string>;

      if (!payload.From || !payload.Body) return null;

      return {
        from: payload.From.replace('whatsapp:', ''),
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

class StubWhatsAppProvider implements IWhatsAppProvider {
  send(_message: WhatsAppMessage): Promise<WhatsAppResult> {
    return Promise.resolve({
      messageId: 'stubbed',
      status: 'skipped',
    });
  }

  verifyWebhook(_signature: string, _payload: string): boolean {
    return true;
  }

  parseInboundMessage(_rawPayload: unknown): WhatsAppWebhookPayload | null {
    return null;
  }
}

export function createWhatsAppProvider(): IWhatsAppProvider {
  if (process.env.SKIP_TWILIO === 'true') {
    return new StubWhatsAppProvider();
  }

  return new TwilioWhatsAppProvider();
}
