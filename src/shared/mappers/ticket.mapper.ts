import type { TicketEntity } from '../../domain/ticket/entities/ticket.entity';

export interface TicketResponse {
  id: string;
  tenantId: string;
  ticketNumber: number;
  customerId: string;
  assignedAgentId?: string;
  createdById: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  tags: string[];
  source: string;
  isEscalated: boolean;
  escalatedAt?: Date;
  escalatedReason?: string;
  resolvedAt?: Date;
  closedAt?: Date;
  firstResponseAt?: Date;
  dueAt?: Date;
  slaBreached: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function mapTicketEntityToResponse(ticket: TicketEntity): TicketResponse {
  return {
    id: ticket.id,
    tenantId: ticket.tenantId,
    ticketNumber: ticket.ticketNumber,
    customerId: ticket.customerId,
    assignedAgentId: ticket.assignedAgentId,
    createdById: ticket.createdById,
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    category: ticket.category,
    tags: ticket.tags,
    source: ticket.source,
    isEscalated: ticket.isEscalated,
    escalatedAt: ticket.escalatedAt,
    escalatedReason: ticket.escalatedReason,
    resolvedAt: ticket.resolvedAt,
    closedAt: ticket.closedAt,
    firstResponseAt: ticket.firstResponseAt,
    dueAt: ticket.dueAt,
    slaBreached: ticket.slaBreached,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}
