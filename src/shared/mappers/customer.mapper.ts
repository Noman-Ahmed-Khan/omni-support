import type { CustomerEntity } from '../../domain/customer/entities/customer.entity';

export interface CustomerResponse {
  id: string;
  tenantId: string;
  assignedAgentId?: string;
  fullName: string;
  email: string;
  phone?: string;
  company?: string;
  notes?: string;
  status: string;
  riskScore: number;
  riskLabel?: string;
  metadata: Record<string, unknown>;
  externalId?: string;
  lastActivityAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export function mapCustomerEntityToResponse(customer: CustomerEntity): CustomerResponse {
  return {
    id: customer.id,
    tenantId: customer.tenantId,
    assignedAgentId: customer.assignedAgentId,
    fullName: customer.fullName,
    email: customer.email,
    phone: customer.phone,
    company: customer.company,
    notes: customer.notes,
    status: customer.status,
    riskScore: customer.riskScore,
    riskLabel: customer.riskLabel,
    metadata: customer.metadata,
    externalId: customer.externalId,
    lastActivityAt: customer.lastActivityAt,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}
