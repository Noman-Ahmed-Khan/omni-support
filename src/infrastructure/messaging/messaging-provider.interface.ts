export type MessagingChannel = 'EMAIL' | 'WHATSAPP' | 'IN_APP';

export interface MessagingEnvelope {
  channel: MessagingChannel;
  tenantId: string;
  recipientId?: string;
  recipientAddress?: string;
  subject?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface MessagingDelivery {
  messageId: string;
  channel: MessagingChannel;
  status: string;
}

export interface IMessagingProvider {
  send(message: MessagingEnvelope): Promise<MessagingDelivery>;
}
