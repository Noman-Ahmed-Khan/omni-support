export interface UpdateTicketCommand {
  tenantId: string;
  ticketId: string;
  updatedById: string;
  updatedByRole: string;
  title?: string;
  description?: string;
  priority?: string;
  category?: string;
  tags?: string[];
  dueAt?: Date;
}
