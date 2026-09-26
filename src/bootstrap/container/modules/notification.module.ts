import type { PrismaClient } from '@prisma/client';

import type { Container } from '..';
import { NotificationService } from '../../../application/notification/services/notification.service';
import { NotificationRepository } from '../../../infrastructure/database/repositories/notification.repository';
import type { EmailQueue } from '../../../infrastructure/queue/queues/email.queue';
import type { RealtimePublisher } from '../../../infrastructure/realtime/realtime-publisher';
import { NotificationController } from '../../../presentation/http/controllers/notification.controller';

export function registerNotificationModule(container: Container): void {
  const prisma = container.resolve<PrismaClient>('prisma');

  const notificationRepository = new NotificationRepository(prisma);
  container.register('notificationRepository', notificationRepository);

  const notificationController = new NotificationController(notificationRepository);
  container.register('notificationController', notificationController);

  const emailQueue = container.resolve<EmailQueue>('emailQueue');
  const wsGateway = container.resolve<RealtimePublisher>('realtimePublisher');

  const notificationService = new NotificationService(
    prisma,
    emailQueue,
    wsGateway,
    notificationRepository,
  );
  container.register('notificationService', notificationService);
}
