export interface RegisterCommand {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  tenantId?: string;
  role?: string;
}
