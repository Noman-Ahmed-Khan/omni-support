import type { PrismaClient } from '@prisma/client';

import { NotificationService } from '../../../application/notification/services/notification.service';
import { NotificationController } from '../../../presentation/http/controllers/notification.controller';
import { NotificationRepository } from '../../database/repositories/notification.repository';
import type { EmailQueue } from '../../queue/queues/email.queue';
import type { WebSocketGateway } from '../../realtime/websocket.gateway';
import type { Container } from '../index';

export function registerNotificationModule(container: Container): void {
  const prisma = container.resolve<PrismaClient>('prisma');

  const notificationRepository = new NotificationRepository(prisma);
  container.register('notificationRepository', notificationRepository);

  const notificationController = new NotificationController(notificationRepository);
  container.register('notificationController', notificationController);

  const emailQueue = container.resolve<EmailQueue>('emailQueue');
  const wsGateway = container.resolve<WebSocketGateway>('wsGateway');

  const notificationService = new NotificationService(
    prisma,
    emailQueue,
    wsGateway,
    notificationRepository,
  );
  container.register('notificationService', notificationService);
}
