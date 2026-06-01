export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
}

export interface EmailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

export interface IEmailProvider {
  send(payload: EmailPayload): Promise<EmailResult>;
  verify(): Promise<boolean>;
}