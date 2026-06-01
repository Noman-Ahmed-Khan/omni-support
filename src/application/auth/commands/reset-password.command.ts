export interface ResetPasswordCommand {
  token: string;
  password: string;
  ipAddress?: string;
}
