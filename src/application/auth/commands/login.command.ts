export interface LoginCommand {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}
