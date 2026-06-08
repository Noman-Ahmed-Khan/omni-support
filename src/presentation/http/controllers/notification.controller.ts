import type { Request, Response, NextFunction } from 'express';

import type { INotificationRepository } from '../../../domain/notification/repositories/notification.repository.interface';
import { successResponse, paginatedResponse } from '../dtos/common/response.dto';

export class NotificationController {
  constructor(private readonly notificationRepository: INotificationRepository) {}

  async getUserNotifications(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 20);

      const result = await this.notificationRepository.findByUser(
        req.user!.id,
        req.tenantId!,
        { page, limit },
      );

      // Serialize entities to JSON
      const data = result.data.map((entity) => ({
        id: entity.id,
        channel: entity.channel,
        subject: entity.subject,
        content: entity.content,
        status: entity.status,
        readAt: entity.readAt,
        createdAt: entity.createdAt,
      }));

      res.status(200).json(paginatedResponse(data, result.total, page, limit));
    } catch (error) {
      next(error);
    }
  }

  async markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.notificationRepository.markAsRead(
        req.params.id,
        req.tenantId!,
        req.user!.id,
      );
      res.status(200).json(successResponse({ message: 'Marked as read' }));
    } catch (error) {
      next(error);
    }
  }

  async markAllAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.notificationRepository.markAllAsRead(req.user!.id, req.tenantId!);
      res
        .status(200)
        .json(successResponse({ message: 'All notifications marked as read' }));
    } catch (error) {
      next(error);
    }
  }
}
