export interface WhatsAppMessage {
  to: string;     // Phone number with country code
  body: string;
  mediaUrl?: string;
  templateName?: string;
  templateParams?: string[];
}

export interface WhatsAppResult {
  messageId: string;
  status: string;
}

export interface WhatsAppWebhookPayload {
  from: string;
  body: string;
  messageId: string;
  timestamp: string;
  mediaUrl?: string;
}

export interface IWhatsAppProvider {
  send(message: WhatsAppMessage): Promise<WhatsAppResult>;
  verifyWebhook(signature: string, payload: string): boolean;
  parseInboundMessage(rawPayload: unknown): WhatsAppWebhookPayload | null;
}