export interface WhatsAppMessage {
  to: string; // Phone number with country code
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
  /** The business number the customer wrote to; identifies the organization. */
  to: string;
  body: string;
  messageId: string;
  timestamp: string;
  mediaUrl?: string;
}

export interface IWhatsAppProvider {
  send(message: WhatsAppMessage): Promise<WhatsAppResult>;
  /**
   * Verifies a Twilio request signature. `path` is the webhook route ("/inbound",
   * "/status") and `params` the form-encoded POST parameters.
   */
  verifyWebhook(
    signature: string,
    path: string,
    params: Record<string, unknown>,
  ): boolean;
  parseInboundMessage(rawPayload: unknown): WhatsAppWebhookPayload | null;
}
