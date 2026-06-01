export interface TicketHistoryQuery {
  ticketId: string;
  tenantId: string;
  page?: number;
  limit?: number;
}
