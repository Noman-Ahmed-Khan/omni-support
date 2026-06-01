export interface CreateTicketCommand {
  tenantId: string;
  customerId: string;
  createdById: string;
  createdByRole: string;
  title: string;
  description: string;
  priority?: string;
  category?: string;
  tags?: string[];
  source?: string;
  dueAt?: Date;
  assignedAgentId?: string;
}
