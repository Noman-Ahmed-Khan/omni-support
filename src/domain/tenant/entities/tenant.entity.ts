import { AggregateRoot } from '../../shared/aggregate-root';
import { TenantStatus } from '../value-objects/tenant-status.vo';
import { TenantSlug } from '../value-objects/tenant-slug.vo';
import { TenantCreatedEvent } from '../events/tenant-created.event';
import { TenantSuspendedEvent } from '../events/tenant-suspended.event';

export interface TenantProps {
  name: string;
  slug: TenantSlug;
  status: TenantStatus;
  plan: string;
  domain?: string;
  logoUrl?: string;
  maxAgents: number;
  maxCustomers: number;
  maxTicketsPerDay: number;
  settings: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
  suspendedAt?: Date;
  suspendedReason?: string;
}

export class TenantEntity extends AggregateRoot {
  private _name: string;
  private _slug: TenantSlug;
  private _status: TenantStatus;
  private _plan: string;
  private _domain?: string;
  private _logoUrl?: string;
  private _maxAgents: number;
  private _maxCustomers: number;
  private _maxTicketsPerDay: number;
  private _settings: Record<string, unknown>;
  private _suspendedAt?: Date;
  private _suspendedReason?: string;

  private constructor(id: string, props: TenantProps) {
    super(id, props.createdAt, props.updatedAt);
    this._name = props.name;
    this._slug = props.slug;
    this._status = props.status;
    this._plan = props.plan;
    this._domain = props.domain;
    this._logoUrl = props.logoUrl;
    this._maxAgents = props.maxAgents;
    this._maxCustomers = props.maxCustomers;
    this._maxTicketsPerDay = props.maxTicketsPerDay;
    this._settings = props.settings;
    this._suspendedAt = props.suspendedAt;
    this._suspendedReason = props.suspendedReason;
  }

  static create(id: string, props: TenantProps): TenantEntity {
    const tenant = new TenantEntity(id, props);
    tenant.addDomainEvent(
      new TenantCreatedEvent(id, props.name, props.slug.toString())
    );
    return tenant;
  }

  static reconstitute(id: string, props: TenantProps): TenantEntity {
    return new TenantEntity(id, props);
  }

  suspend(reason: string): void {
    if (this._status.isSuspended()) {
      throw new Error('Tenant is already suspended');
    }
    this._status = TenantStatus.create('SUSPENDED');
    this._suspendedAt = new Date();
    this._suspendedReason = reason;
    this.addDomainEvent(
      new TenantSuspendedEvent(this.id, reason)
    );
  }

  activate(): void {
    this._status = TenantStatus.create('ACTIVE');
    this._suspendedAt = undefined;
    this._suspendedReason = undefined;
  }

  updateSettings(settings: Partial<Record<string, unknown>>): void {
    this._settings = { ...this._settings, ...settings };
  }

  isActive(): boolean {
    return this._status.isActive();
  }

  canCreateTicket(): boolean {
    return this._status.isActive() || this._status.isTrial();
  }

  // Getters
  get name(): string { return this._name; }
  get slug(): string { return this._slug.toString(); }
  get status(): string { return this._status.toString(); }
  get plan(): string { return this._plan; }
  get domain(): string | undefined { return this._domain; }
  get logoUrl(): string | undefined { return this._logoUrl; }
  get maxAgents(): number { return this._maxAgents; }
  get maxCustomers(): number { return this._maxCustomers; }
  get maxTicketsPerDay(): number { return this._maxTicketsPerDay; }
  get settings(): Record<string, unknown> { return { ...this._settings }; }
  get suspendedAt(): Date | undefined { return this._suspendedAt; }
  get suspendedReason(): string | undefined { return this._suspendedReason; }
}