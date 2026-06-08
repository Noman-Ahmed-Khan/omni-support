import type {
  EmailPayload,
  EmailResult,
  IEmailProvider,
} from './email-provider.interface';
import { SMTPEmailProvider } from './smtp.provider';

export class SESEmailProvider implements IEmailProvider {
  private readonly smtpProvider = new SMTPEmailProvider();

  async send(payload: EmailPayload): Promise<EmailResult> {
    return this.smtpProvider.send(payload);
  }

  async verify(): Promise<boolean> {
    return this.smtpProvider.verify();
  }
}
