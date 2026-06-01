export interface UpdateCustomerCommand {
  tenantId: string;
  customerId: string;
  updatedById: string;
  updatedByRole: string;
  fullName?: string;
  phone?: string;
  company?: string;
  notes?: string;
  assignedAgentId?: string;
  status?: string;
}
