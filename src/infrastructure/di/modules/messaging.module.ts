import { MessagingService } from '../../../application/messaging/services/messaging.service';
import { SMTPEmailProvider } from '../../messaging/email/smtp.provider';
import { createWhatsAppProvider } from '../../messaging/whatsapp/twilio-whatsapp.provider';
import { EmailQueue } from '../../queue/queues/email.queue';
import { NotificationQueue } from '../../queue/queues/notification.queue';
import type { Container } from '../index';

export function registerMessagingModule(container: Container): void {
  const emailProvider = new SMTPEmailProvider();
  container.register('emailProvider', emailProvider);

  const whatsAppProvider = createWhatsAppProvider();
  container.register('whatsAppProvider', whatsAppProvider);

  const emailQueue = new EmailQueue();
  container.register('emailQueue', emailQueue);

  const notificationQueue = new NotificationQueue();
  container.register('notificationQueue', notificationQueue);

  const messagingService = new MessagingService(whatsAppProvider, emailQueue);
  container.register('messagingService', messagingService);
}
