import type { IWhatsAppProvider } from '../../../infrastructure/messaging/whatsapp/whatsapp-provider.interface';
import type { EmailQueue } from '../../../infrastructure/queue/queues/email.queue';

export interface SendMessageOptions {
  channel: 'EMAIL' | 'WHATSAPP';
  to: string;
  subject?: string;
  content: string;
  templateId?: string;
  templateData?: Record<string, string>;
}

export class MessagingService {
  constructor(
    private readonly whatsappProvider: IWhatsAppProvider,
    private readonly emailQueue: EmailQueue,
  ) {}

  async sendMessage(options: SendMessageOptions): Promise<void> {
    if (options.channel === 'EMAIL') {
      // Dispatch via queue
      await this.emailQueue.add({
        to: options.to,
        subject: options.subject || 'Notification',
        html: options.content,
      });
    } else if (options.channel === 'WHATSAPP') {
      // Send directly via provider
      await this.whatsappProvider.send({ to: options.to, body: options.content });
    } else {
      throw new Error('Unsupported messaging channel');
    }
  }
}
