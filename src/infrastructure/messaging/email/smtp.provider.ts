import nodemailer, { Transporter } from 'nodemailer';
import {
  IEmailProvider,
  EmailPayload,
  EmailResult,
} from './email-provider.interface';
import { messagingConfig } from '../../../config/messaging.config';
import { InfrastructureError } from '../../../shared/errors/infrastructure.error';
import { logger } from '../../../shared/utils/logger.util';

export class SMTPEmailProvider implements IEmailProvider {
  private readonly transporter: Transporter<SmtpSentMessageInfo>;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: messagingConfig.smtp.host,
      port: messagingConfig.smtp.port,
      secure: messagingConfig.smtp.port === 465,
      auth: {
        user: messagingConfig.smtp.user,
        pass: messagingConfig.smtp.password,
      },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      rateDelta: 1000,
      rateLimit: 10, // 10 messages per second
    });
  }

  async send(payload: EmailPayload): Promise<EmailResult> {
    try {
      const result = await this.transporter.sendMail({
        from: payload.from ?? messagingConfig.email.from,
        to: Array.isArray(payload.to) ? payload.to.join(', ') : payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        replyTo: payload.replyTo,
        cc: payload.cc,
        bcc: payload.bcc,
      });

      logger.info('Email sent', {
        messageId: result.messageId,
        to: payload.to,
      });

      return {
        messageId: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected,
      };
    } catch (error) {
      logger.error('Email send failed', { error, to: payload.to });
      throw new InfrastructureError('Email send failed', { error });
    }
  }

  async verify(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }
}

interface SmtpSentMessageInfo {
  messageId: string;
  accepted: string[];
  rejected: string[];
}
