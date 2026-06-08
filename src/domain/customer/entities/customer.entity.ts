import { AggregateRoot } from '../../shared/aggregate-root';
import type { Email } from '../../user/value-objects/email.vo';
import { CustomerCreatedEvent } from '../events/customer-created.event';
import { CustomerRiskUpdatedEvent } from '../events/customer-risk-updated.event';
import { RiskScore } from '../value-objects/risk-score.vo';

export enum CustomerStatusEnum {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  BLOCKED = 'BLOCKED',
}

export interface CustomerProps {
  tenantId: string;
  assignedAgentId?: string;
  fullName: string;
  email: Email;
  phone?: string;
  company?: string;
  notes?: string;
  status: CustomerStatusEnum;
  riskScore: number;
  riskLabel?: string;
  metadata: Record<string, unknown>;
  externalId?: string;
  lastActivityAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export class CustomerEntity extends AggregateRoot {
  private _tenantId: string;
  private _assignedAgentId?: string;
  private _fullName: string;
  private _email: Email;
  private _phone?: string;
  private _company?: string;
  private _notes?: string;
  private _status: CustomerStatusEnum;
  private _riskScore: number;
  private _riskLabel?: string;
  private _metadata: Record<string, unknown>;
  private _externalId?: string;
  private _lastActivityAt?: Date;

  private constructor(id: string, props: CustomerProps) {
    super(id, props.createdAt, props.updatedAt);
    this._tenantId = props.tenantId;
    this._assignedAgentId = props.assignedAgentId;
    this._fullName = props.fullName;
    this._email = props.email;
    this._phone = props.phone;
    this._company = props.company;
    this._notes = props.notes;
    this._status = props.status;
    this._riskScore = props.riskScore;
    this._riskLabel = props.riskLabel;
    this._metadata = props.metadata;
    this._externalId = props.externalId;
    this._lastActivityAt = props.lastActivityAt;
  }

  static create(id: string, props: CustomerProps): CustomerEntity {
    const customer = new CustomerEntity(id, props);
    customer.addDomainEvent(
      new CustomerCreatedEvent(
        id,
        props.tenantId,
        props.email.toString(),
        props.fullName,
      ),
    );
    return customer;
  }

  static reconstitute(id: string, props: CustomerProps): CustomerEntity {
    return new CustomerEntity(id, props);
  }

  updateRiskScore(score: number, label: string): void {
    const previousScore = this._riskScore;
    const riskScore = RiskScore.create(score, label);
    this._riskScore = riskScore.value;
    this._riskLabel = riskScore.riskLabel;

    this.addDomainEvent(
      new CustomerRiskUpdatedEvent(
        this.id,
        this._tenantId,
        previousScore,
        riskScore.value,
        riskScore.riskLabel,
      ),
    );
  }

  assignAgent(agentId: string): void {
    this._assignedAgentId = agentId;
  }

  recordActivity(): void {
    this._lastActivityAt = new Date();
  }

  block(): void {
    this._status = CustomerStatusEnum.BLOCKED;
  }

  activate(): void {
    this._status = CustomerStatusEnum.ACTIVE;
  }

  isBlocked(): boolean {
    return this._status === CustomerStatusEnum.BLOCKED;
  }

  isHighRisk(): boolean {
    return this._riskScore >= 70;
  }

  // Getters
  get tenantId(): string {
    return this._tenantId;
  }
  get assignedAgentId(): string | undefined {
    return this._assignedAgentId;
  }
  get fullName(): string {
    return this._fullName;
  }
  get email(): string {
    return this._email.toString();
  }
  get phone(): string | undefined {
    return this._phone;
  }
  get company(): string | undefined {
    return this._company;
  }
  get notes(): string | undefined {
    return this._notes;
  }
  get status(): string {
    return this._status;
  }
  get riskScore(): number {
    return this._riskScore;
  }
  get riskLabel(): string | undefined {
    return this._riskLabel;
  }
  get metadata(): Record<string, unknown> {
    return { ...this._metadata };
  }
  get externalId(): string | undefined {
    return this._externalId;
  }
  get lastActivityAt(): Date | undefined {
    return this._lastActivityAt;
  }
}
