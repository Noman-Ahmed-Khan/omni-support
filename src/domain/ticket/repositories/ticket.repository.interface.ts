import { TicketEntity } from '../entities/ticket.entity';

export interface TicketFilters {
  tenantId: string;
  status?: string | string[];
  priority?: string | string[];
  category?: string;
  assignedAgentId?: string;
  customerId?: string;
  isEscalated?: boolean;
  slaBreached?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
  tags?: string[];
}

export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ITicketRepository {
  findById(id: string, tenantId: string): Promise<TicketEntity | null>;
  findByTicketNumber(
    ticketNumber: number,
    tenantId: string,
  ): Promise<TicketEntity | null>;
  findAll(
    filters: TicketFilters,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<TicketEntity>>;
  findByAgentId(
    agentId: string,
    tenantId: string,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<TicketEntity>>;
  findByCustomerId(
    customerId: string,
    tenantId: string,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<TicketEntity>>;
  save(ticket: TicketEntity): Promise<TicketEntity>;
  update(ticket: TicketEntity): Promise<TicketEntity>;
  delete(id: string, tenantId: string): Promise<void>;
  getNextTicketNumber(tenantId: string): Promise<number>;
  countByTenantId(tenantId: string): Promise<number>;
  countByStatus(tenantId: string): Promise<Record<string, number>>;
  countByPriority(tenantId: string): Promise<Record<string, number>>;
  findOverdueTickets(tenantId: string): Promise<TicketEntity[]>;
  findEscalatedTickets(tenantId: string): Promise<TicketEntity[]>;
}
