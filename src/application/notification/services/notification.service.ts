import crypto from 'crypto';

import type { PrismaClient } from '@prisma/client';

import { getAppConfig } from '../../../config/app.config';
import {
  NotificationEntity,
  NotificationStatusEnum,
} from '../../../domain/notification/entities/notification.entity';
import type { INotificationRepository } from '../../../domain/notification/repositories/notification.repository.interface';
import {
  NotificationChannelValue,
  NotificationChannel,
} from '../../../domain/notification/value-objects/notification-channel.vo';
import type { EmailQueue } from '../../../infrastructure/queue/queues/email.queue';
import type { WebSocketGateway } from '../../../infrastructure/realtime/websocket.gateway';
import { logger } from '../../../shared/utils/logger.util';

export type NotificationEvent =
  | 'TICKET_CREATED'
  | 'TICKET_ASSIGNED'
  | 'TICKET_ESCALATED'
  | 'TICKET_RESOLVED'
  | 'COMMENT_ADDED';

export interface NotifyTicketCreatedDto {
  tenantId: string;
  ticketId: string;
  ticketNumber: number;
  title: string;
  customerId: string;
  assignedAgentId?: string;
}

export interface NotifyTicketAssignedDto {
  tenantId: string;
  ticketId: string;
  ticketNumber: number;
  title: string;
  agentId: string;
  assignedById: string;
}

export interface NotifyTicketEscalatedDto {
  tenantId: string;
  ticketId: string;
  ticketNumber: number;
  title: string;
  reason: string;
  assignedAgentId?: string;
}

export interface NotifyCommentAddedDto {
  tenantId: string;
  ticketId: string;
  ticketNumber: number;
  title: string;
  authorId: string;
  authorName: string;
  commentType: string;
  customerId: string;
}

export class NotificationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailQueue: EmailQueue,
    private readonly wsGateway: WebSocketGateway,
    private readonly notificationRepository: INotificationRepository,
  ) {}

  async notifyTicketCreated(dto: NotifyTicketCreatedDto): Promise<void> {
    try {
      const [customer, tenant] = await Promise.all([
        this.prisma.customer.findUnique({ where: { id: dto.customerId } }),
        this.prisma.tenant.findUnique({ where: { id: dto.tenantId } }),
      ]);

      if (!customer || !tenant) return;

      const ticketUrl = `${getAppConfig().frontendUrl}/tickets/${dto.ticketId}`;

      // Email customer
      await this.emailQueue.add({
        to: customer.email,
        subject: `[${tenant.name}] Ticket #${dto.ticketNumber} Created: ${dto.title}`,
        html: this.buildTicketCreatedEmail(
          customer.fullName,
          dto.ticketNumber,
          dto.title,
          ticketUrl,
          tenant.name,
        ),
      });

      // Create in-app notification
      await this.createNotification({
        tenantId: dto.tenantId,
        customerId: dto.customerId,
        ticketId: dto.ticketId,
        channel: NotificationChannelValue.IN_APP,
        subject: `Ticket #${dto.ticketNumber} Created`,
        content: `Your support ticket "${dto.title}" has been received and is being reviewed.`,
      });

      // Notify assigned agent
      if (dto.assignedAgentId) {
        await this.notifyAgentOfAssignment({
          tenantId: dto.tenantId,
          ticketId: dto.ticketId,
          ticketNumber: dto.ticketNumber,
          title: dto.title,
          agentId: dto.assignedAgentId,
          assignedById: 'system',
        });
      }

      // WebSocket notification to tenant managers
      this.wsGateway.sendToTenant(dto.tenantId, {
        event: 'notification:ticket-created',
        data: {
          ticketId: dto.ticketId,
          ticketNumber: dto.ticketNumber,
          title: dto.title,
        },
      });
    } catch (error) {
      logger.error('Failed to send ticket created notification', {
        ticketId: dto.ticketId,
        error,
      });
    }
  }

  async notifyTicketAssigned(dto: NotifyTicketAssignedDto): Promise<void> {
    try {
      const [agent, tenant] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: dto.agentId } }),
        this.prisma.tenant.findUnique({ where: { id: dto.tenantId } }),
      ]);

      if (!agent || !tenant) return;

      const ticketUrl = `${getAppConfig().frontendUrl}/tickets/${dto.ticketId}`;

      // Email agent
      await this.emailQueue.add({
        to: agent.email,
        subject: `[${tenant.name}] Ticket #${dto.ticketNumber} Assigned to You`,
        html: this.buildTicketAssignedEmail(
          agent.firstName,
          dto.ticketNumber,
          dto.title,
          ticketUrl,
          tenant.name,
        ),
      });

      // WebSocket real-time notification to agent
      this.wsGateway.sendToUser(dto.agentId, {
        event: 'notification:ticket-assigned',
        data: {
          ticketId: dto.ticketId,
          ticketNumber: dto.ticketNumber,
          title: dto.title,
        },
      });

      await this.createNotification({
        tenantId: dto.tenantId,
        userId: dto.agentId,
        ticketId: dto.ticketId,
        channel: NotificationChannelValue.IN_APP,
        subject: `Ticket #${dto.ticketNumber} Assigned`,
        content: `Ticket "${dto.title}" has been assigned to you.`,
      });
    } catch (error) {
      logger.error('Failed to send ticket assigned notification', {
        ticketId: dto.ticketId,
        error,
      });
    }
  }

  async notifyTicketEscalated(dto: NotifyTicketEscalatedDto): Promise<void> {
    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: dto.tenantId },
      });
      if (!tenant) return;

      // Notify all tenant managers
      const managers = await this.prisma.user.findMany({
        where: {
          tenantId: dto.tenantId,
          role: 'TENANT_MANAGER',
          status: 'ACTIVE',
        },
      });

      const ticketUrl = `${getAppConfig().frontendUrl}/tickets/${dto.ticketId}`;

      for (const manager of managers) {
        await this.emailQueue.add(
          {
            to: manager.email,
            subject: `[${tenant.name}] Ticket #${dto.ticketNumber} ESCALATED`,
            html: this.buildTicketEscalatedEmail(
              manager.firstName,
              dto.ticketNumber,
              dto.title,
              dto.reason,
              ticketUrl,
              tenant.name,
            ),
          },
          1, // High priority
        );

        this.wsGateway.sendToUser(manager.id, {
          event: 'notification:ticket-escalated',
          data: {
            ticketId: dto.ticketId,
            ticketNumber: dto.ticketNumber,
            title: dto.title,
            reason: dto.reason,
          },
        });
      }

      // Notify assigned agent if exists
      if (dto.assignedAgentId) {
        const agent = await this.prisma.user.findUnique({
          where: { id: dto.assignedAgentId },
        });

        if (agent) {
          await this.emailQueue.add(
            {
              to: agent.email,
              subject: `🚨 Ticket #${dto.ticketNumber} Has Been Escalated`,
              html: this.buildTicketEscalatedEmail(
                agent.firstName,
                dto.ticketNumber,
                dto.title,
                dto.reason,
                ticketUrl,
                tenant.name,
              ),
            },
            1,
          );
        }
      }

      // Broadcast to entire tenant
      this.wsGateway.sendToTenant(dto.tenantId, {
        event: 'notification:ticket-escalated',
        data: {
          ticketId: dto.ticketId,
          ticketNumber: dto.ticketNumber,
          title: dto.title,
        },
      });
    } catch (error) {
      logger.error('Failed to send escalation notification', {
        ticketId: dto.ticketId,
        error,
      });
    }
  }

  async notifyTicketResolved(ticketId: string, tenantId: string): Promise<void> {
    try {
      const ticket = await this.prisma.ticket.findFirst({
        where: { id: ticketId, tenantId },
        include: {
          customer: true,
          tenant: true,
        },
      });

      if (!ticket) return;

      const ticketUrl = `${getAppConfig().frontendUrl}/tickets/${ticketId}`;

      // Email customer
      await this.emailQueue.add({
        to: ticket.customer.email,
        subject: `[${ticket.tenant.name}] Ticket #${ticket.ticketNumber} Resolved`,
        html: this.buildTicketResolvedEmail(
          ticket.customer.fullName,
          ticket.ticketNumber,
          ticket.title,
          ticketUrl,
          ticket.tenant.name,
        ),
      });

      // WebSocket
      this.wsGateway.sendToTicket(ticketId, {
        event: 'notification:ticket-resolved',
        data: { ticketId, ticketNumber: ticket.ticketNumber },
      });
    } catch (error) {
      logger.error('Failed to send resolved notification', { ticketId, error });
    }
  }

  async notifyCommentAdded(dto: NotifyCommentAddedDto): Promise<void> {
    try {
      if (dto.commentType === 'INTERNAL') {
        // Internal notes only go to agents via WebSocket
        this.wsGateway.sendToTicket(dto.ticketId, {
          event: 'notification:internal-note-added',
          data: {
            ticketId: dto.ticketId,
            authorId: dto.authorId,
            authorName: dto.authorName,
          },
        });
        return;
      }

      const ticket = await this.prisma.ticket.findFirst({
        where: { id: dto.ticketId, tenantId: dto.tenantId },
        include: { customer: true, tenant: true, assignedAgent: true },
      });

      if (!ticket) return;

      // Notify customer if agent commented
      const author = await this.prisma.user.findUnique({
        where: { id: dto.authorId },
      });

      if (author && author.role !== 'CUSTOMER') {
        await this.emailQueue.add({
          to: ticket.customer.email,
          subject: `[${ticket.tenant.name}] New reply on Ticket #${dto.ticketNumber}`,
          html: this.buildCommentNotificationEmail(
            ticket.customer.fullName,
            dto.ticketNumber,
            dto.title,
            dto.authorName,
            `${getAppConfig().frontendUrl}/tickets/${dto.ticketId}`,
            ticket.tenant.name,
          ),
        });
      }

      // Notify agent if customer commented
      if (author?.role === 'CUSTOMER' && ticket.assignedAgent) {
        this.wsGateway.sendToUser(ticket.assignedAgent.id, {
          event: 'notification:customer-replied',
          data: {
            ticketId: dto.ticketId,
            ticketNumber: dto.ticketNumber,
            customerName: dto.authorName,
          },
        });
      }

      // Always push to ticket room
      this.wsGateway.sendToTicket(dto.ticketId, {
        event: 'notification:comment-added',
        data: {
          ticketId: dto.ticketId,
          authorId: dto.authorId,
          authorName: dto.authorName,
        },
      });
    } catch (error) {
      logger.error('Failed to send comment notification', {
        ticketId: dto.ticketId,
        error,
      });
    }
  }

  private async notifyAgentOfAssignment(dto: NotifyTicketAssignedDto): Promise<void> {
    await this.notifyTicketAssigned(dto);
  }

  private async createNotification(data: {
    tenantId: string;
    userId?: string;
    customerId?: string;
    ticketId?: string;
    channel: NotificationChannelValue;
    subject?: string;
    content: string;
  }): Promise<void> {
    const notification = NotificationEntity.create(crypto.randomUUID(), {
      tenantId: data.tenantId,
      userId: data.userId,
      customerId: data.customerId,
      ticketId: data.ticketId,
      channel: NotificationChannel.create(data.channel),
      status: NotificationStatusEnum.SENT,
      subject: data.subject,
      content: data.content,
      metadata: {},
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date(),
      sentAt: new Date(),
    });

    await this.notificationRepository.save(notification);
  }

  // Email Templates

  private buildTicketCreatedEmail(
    customerName: string,
    ticketNumber: number,
    title: string,
    ticketUrl: string,
    tenantName: string,
  ): string {
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#4F46E5;">${tenantName} Support</h2>
        <p>Hi ${customerName},</p>
        <p>Your support ticket has been created successfully.</p>
        <div style="background:#F3F4F6;padding:16px;border-radius:8px;margin:16px 0;">
          <p><strong>Ticket #${ticketNumber}</strong></p>
          <p>${title}</p>
        </div>
        <a href="${ticketUrl}" style="background:#4F46E5;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;display:inline-block;">
          View Ticket
        </a>
        <p style="color:#6B7280;font-size:12px;margin-top:32px;">
          This is an automated message from ${tenantName} Support.
        </p>
      </div>
    `;
  }

  private buildTicketAssignedEmail(
    agentName: string,
    ticketNumber: number,
    title: string,
    ticketUrl: string,
    tenantName: string,
  ): string {
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#4F46E5;">${tenantName} Support</h2>
        <p>Hi ${agentName},</p>
        <p>Ticket #${ticketNumber} has been assigned to you.</p>
        <div style="background:#F3F4F6;padding:16px;border-radius:8px;margin:16px 0;">
          <p><strong>${title}</strong></p>
        </div>
        <a href="${ticketUrl}" style="background:#4F46E5;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;display:inline-block;">
          View Ticket
        </a>
      </div>
    `;
  }

  private buildTicketEscalatedEmail(
    recipientName: string,
    ticketNumber: number,
    title: string,
    reason: string,
    ticketUrl: string,
    tenantName: string,
  ): string {
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#DC2626;">🚨 Escalation Alert - ${tenantName}</h2>
        <p>Hi ${recipientName},</p>
        <p>Ticket #${ticketNumber} requires immediate attention.</p>
        <div style="background:#FEF2F2;border:1px solid #DC2626;padding:16px;border-radius:8px;margin:16px 0;">
          <p><strong>${title}</strong></p>
          <p><strong>Reason:</strong> ${reason}</p>
        </div>
        <a href="${ticketUrl}" style="background:#DC2626;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;display:inline-block;">
          View Escalated Ticket
        </a>
      </div>
    `;
  }

  private buildTicketResolvedEmail(
    customerName: string,
    ticketNumber: number,
    title: string,
    ticketUrl: string,
    tenantName: string,
  ): string {
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#059669;">${tenantName} Support</h2>
        <p>Hi ${customerName},</p>
        <p>Your support ticket has been resolved.</p>
        <div style="background:#ECFDF5;padding:16px;border-radius:8px;margin:16px 0;">
          <p><strong>Ticket #${ticketNumber}</strong></p>
          <p>${title}</p>
        </div>
        <a href="${ticketUrl}" style="background:#059669;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;display:inline-block;">
          View Resolution
        </a>
        <p>If you're not satisfied, you can reopen your ticket from the link above.</p>
      </div>
    `;
  }

  private buildCommentNotificationEmail(
    recipientName: string,
    ticketNumber: number,
    title: string,
    authorName: string,
    ticketUrl: string,
    tenantName: string,
  ): string {
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#4F46E5;">${tenantName} Support</h2>
        <p>Hi ${recipientName},</p>
        <p><strong>${authorName}</strong> replied to Ticket #${ticketNumber}.</p>
        <div style="background:#F3F4F6;padding:16px;border-radius:8px;margin:16px 0;">
          <p>${title}</p>
        </div>
        <a href="${ticketUrl}" style="background:#4F46E5;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;display:inline-block;">
          View Reply
        </a>
      </div>
    `;
  }
}
