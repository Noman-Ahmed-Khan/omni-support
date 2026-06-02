import { AggregateRoot } from '../../shared/aggregate-root';
import { TicketStatus } from '../value-objects/ticket-status.vo';
import { TicketPriority } from '../value-objects/ticket-priority.vo';
import { TicketCategory } from '../value-objects/ticket-category.vo';
import { TicketCreatedEvent } from '../events/ticket-created.event';
import { TicketAssignedEvent } from '../events/ticket-assigned.event';
import { TicketEscalatedEvent } from '../events/ticket-escalated.event';
import { TicketResolvedEvent } from '../events/ticket-resolved.event';
import { TicketStatusChangedEvent } from '../events/ticket-status-changed.event';

export interface TicketProps {
  tenantId: string;
  ticketNumber: number;
  customerId: string;
  assignedAgentId?: string;
  createdById: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
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
  metadata: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export class TicketEntity extends AggregateRoot {
  private _tenantId: string;
  private _ticketNumber: number;
  private _customerId: string;
  private _assignedAgentId?: string;
  private _createdById: string;
  private _title: string;
  private _description: string;
  private _status: TicketStatus;
  private _priority: TicketPriority;
  private _category: string;
  private _tags: string[];
  private _source: string;
  private _isEscalated: boolean;
  private _escalatedAt?: Date;
  private _escalatedReason?: string;
  private _resolvedAt?: Date;
  private _closedAt?: Date;
  private _firstResponseAt?: Date;
  private _dueAt?: Date;
  private _slaBreached: boolean;
  private _metadata: Record<string, unknown>;

  private constructor(id: string, props: TicketProps) {
    super(id, props.createdAt, props.updatedAt);
    this._tenantId = props.tenantId;
    this._ticketNumber = props.ticketNumber;
    this._customerId = props.customerId;
    this._assignedAgentId = props.assignedAgentId;
    this._createdById = props.createdById;
    this._title = props.title;
    this._description = props.description;
    this._status = props.status;
    this._priority = props.priority;
    this._category = props.category;
    this._tags = props.tags;
    this._source = props.source;
    this._isEscalated = props.isEscalated;
    this._escalatedAt = props.escalatedAt;
    this._escalatedReason = props.escalatedReason;
    this._resolvedAt = props.resolvedAt;
    this._closedAt = props.closedAt;
    this._firstResponseAt = props.firstResponseAt;
    this._dueAt = props.dueAt;
    this._slaBreached = props.slaBreached;
    this._metadata = props.metadata;
  }

  static create(id: string, props: TicketProps): TicketEntity {
    const ticket = new TicketEntity(id, props);
    ticket.addDomainEvent(
      new TicketCreatedEvent(
        id,
        props.tenantId,
        props.customerId,
        props.createdById,
        props.priority.toString(),
        props.category,
      ),
    );
    return ticket;
  }

  static reconstitute(id: string, props: TicketProps): TicketEntity {
    return new TicketEntity(id, props);
  }

  changeStatus(newStatus: TicketStatus, changedById: string): void {
    if (!this._status.canTransitionTo(newStatus)) {
      throw new Error(
        `Cannot transition from ${this._status.toString()} to ${newStatus.toString()}`,
      );
    }

    const oldStatus = this._status.toString();
    this._status = newStatus;

    if (newStatus.isResolved() && !this._resolvedAt) {
      this._resolvedAt = new Date();
    }

    if (newStatus.isClosed() && !this._closedAt) {
      this._closedAt = new Date();
    }

    this.addDomainEvent(
      new TicketStatusChangedEvent(
        this.id,
        this._tenantId,
        oldStatus,
        newStatus.toString(),
        changedById,
      ),
    );
  }

  assign(agentId: string, assignedById: string): void {
    const previousAgentId = this._assignedAgentId;
    this._assignedAgentId = agentId;

    if (!this._firstResponseAt) {
      this._firstResponseAt = new Date();
    }

    this.addDomainEvent(
      new TicketAssignedEvent(
        this.id,
        this._tenantId,
        this._customerId,
        agentId,
        previousAgentId,
        assignedById,
      ),
    );
  }

  escalate(reason: string, escalatedById: string): void {
    if (this._isEscalated) {
      throw new Error('Ticket is already escalated');
    }

    this._isEscalated = true;
    this._escalatedAt = new Date();
    this._escalatedReason = reason;
    this._priority = TicketPriority.create('CRITICAL');

    this.addDomainEvent(
      new TicketEscalatedEvent(
        this.id,
        this._tenantId,
        this._customerId,
        this._assignedAgentId,
        reason,
        escalatedById,
      ),
    );
  }

  resolve(resolvedById: string): void {
    this.changeStatus(TicketStatus.resolved(), resolvedById);

    this.addDomainEvent(
      new TicketResolvedEvent(
        this.id,
        this._tenantId,
        this._customerId,
        this._assignedAgentId,
        resolvedById,
      ),
    );
  }

  markSlaBreached(): void {
    this._slaBreached = true;
  }

  updatePriority(priority: TicketPriority): void {
    this._priority = priority;
  }

  updateCategory(category: string): void {
    this._category = TicketCategory.create(category).toString();
  }

  addTag(tag: string): void {
    if (!this._tags.includes(tag)) {
      this._tags = [...this._tags, tag];
    }
  }

  isActive(): boolean {
    return this._status.isActive();
  }

  isCritical(): boolean {
    return this._priority.isCritical();
  }

  // Getters
  get tenantId(): string {
    return this._tenantId;
  }
  get ticketNumber(): number {
    return this._ticketNumber;
  }
  get customerId(): string {
    return this._customerId;
  }
  get assignedAgentId(): string | undefined {
    return this._assignedAgentId;
  }
  get createdById(): string {
    return this._createdById;
  }
  get title(): string {
    return this._title;
  }
  get description(): string {
    return this._description;
  }
  get status(): string {
    return this._status.toString();
  }
  get priority(): string {
    return this._priority.toString();
  }
  get category(): string {
    return this._category;
  }
  get tags(): string[] {
    return [...this._tags];
  }
  get source(): string {
    return this._source;
  }
  get isEscalated(): boolean {
    return this._isEscalated;
  }
  get escalatedAt(): Date | undefined {
    return this._escalatedAt;
  }
  get escalatedReason(): string | undefined {
    return this._escalatedReason;
  }
  get resolvedAt(): Date | undefined {
    return this._resolvedAt;
  }
  get closedAt(): Date | undefined {
    return this._closedAt;
  }
  get firstResponseAt(): Date | undefined {
    return this._firstResponseAt;
  }
  get dueAt(): Date | undefined {
    return this._dueAt;
  }
  get slaBreached(): boolean {
    return this._slaBreached;
  }
  get metadata(): Record<string, unknown> {
    return { ...this._metadata };
  }
}
