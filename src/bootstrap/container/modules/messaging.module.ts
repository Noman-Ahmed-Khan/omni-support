import type { Container } from '..';
import { MessagingService } from '../../../application/messaging/services/messaging.service';
import { SMTPEmailProvider } from '../../../infrastructure/messaging/email/smtp.provider';
import { createWhatsAppProvider } from '../../../infrastructure/messaging/whatsapp/twilio-whatsapp.provider';
import { EmailQueue } from '../../../infrastructure/queue/queues/email.queue';
import { NotificationQueue } from '../../../infrastructure/queue/queues/notification.queue';

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
