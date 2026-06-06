import { TenantEntity } from '../../domain/tenant/entities/tenant.entity';
import { TenantSlug } from '../../domain/tenant/value-objects/tenant-slug.vo';
import { TenantStatus } from '../../domain/tenant/value-objects/tenant-status.vo';

export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  domain?: string | null;
  logoUrl?: string | null;
  maxAgents: number;
  maxCustomers: number;
  maxTicketsPerDay: number;
  settings: unknown;
  suspendedAt?: Date | null;
  suspendedReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function mapPrismaTenantToEntity(record: TenantRecord): TenantEntity {
  const settings =
    typeof record.settings === 'object' && record.settings !== null
      ? (record.settings as Record<string, unknown>)
      : {};

  return TenantEntity.reconstitute(record.id, {
    name: record.name,
    slug: TenantSlug.create(record.slug),
    status: TenantStatus.create(record.status),
    plan: record.plan,
    domain: record.domain ?? undefined,
    logoUrl: record.logoUrl ?? undefined,
    maxAgents: record.maxAgents,
    maxCustomers: record.maxCustomers,
    maxTicketsPerDay: record.maxTicketsPerDay,
    settings,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    suspendedAt: record.suspendedAt ?? undefined,
    suspendedReason: record.suspendedReason ?? undefined,
  });
}

export interface TenantResponse {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  domain?: string;
  logoUrl?: string;
  maxAgents: number;
  maxCustomers: number;
  maxTicketsPerDay: number;
  settings: Record<string, unknown>;
  suspendedAt?: Date;
  suspendedReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export function mapTenantEntityToResponse(tenant: TenantEntity): TenantResponse {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    plan: tenant.plan,
    domain: tenant.domain,
    logoUrl: tenant.logoUrl,
    maxAgents: tenant.maxAgents,
    maxCustomers: tenant.maxCustomers,
    maxTicketsPerDay: tenant.maxTicketsPerDay,
    settings: tenant.settings,
    suspendedAt: tenant.suspendedAt,
    suspendedReason: tenant.suspendedReason,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  };
}
