export interface CreateCustomerCommand {
  tenantId: string;
  createdById: string;
  createdByRole: string;
  fullName: string;
  email: string;
  phone?: string;
  company?: string;
  notes?: string;
  assignedAgentId?: string;
  externalId?: string;
}
