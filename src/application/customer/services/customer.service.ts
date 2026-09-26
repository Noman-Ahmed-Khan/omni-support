import crypto from 'crypto';

import {
  CustomerEntity,
  CustomerStatusEnum,
} from '../../../domain/customer/entities/customer.entity';
import type {
  ICustomerRepository,
  CustomerFilters,
  PaginationOptions,
  PaginatedResult,
} from '../../../domain/customer/repositories/customer.repository.interface';
import type { IUserRepository } from '../../../domain/user/repositories/user.repository.interface';
import { Email } from '../../../domain/user/value-objects/email.vo';
import type { ActivityRepository } from '../../../infrastructure/database/repositories/activity.repository';
import type { AuditRepository } from '../../../infrastructure/database/repositories/audit.repository';
import type { TransactionManager } from '../../../infrastructure/database/transaction-manager';
import type { AIQueue } from '../../../infrastructure/queue/queues/ai.queue';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../../../shared/errors/domain.error';
import { logger } from '../../../shared/utils/logger.util';
import type { IEventBus } from '../../event-bus/event-bus.interface';

export interface CreateCustomerDto {
  tenantId: string;
  createdById: string;
  createdByRole: string;
  fullName: string;
  email: string;
  phone?: string;
  company?: string;
  notes?: string;
  assignedAgentId?: string;
  externalId?: string;
}

export interface UpdateCustomerDto {
  tenantId: string;
  customerId: string;
  updatedById: string;
  updatedByRole: string;
  fullName?: string;
  phone?: string;
  company?: string;
  notes?: string;
  assignedAgentId?: string;
  status?: string;
}

export class CustomerService {
  constructor(
    private readonly customerRepo: ICustomerRepository,
    private readonly eventBus: IEventBus,
    private readonly activityRepo: ActivityRepository,
    private readonly auditRepo: AuditRepository,
    private readonly aiQueue: AIQueue,
    private readonly userRepo?: Pick<IUserRepository, 'findById'>,
    private readonly transactionManager?: Pick<TransactionManager, 'run'>,
  ) {}

  /** Runs the work atomically when a transaction manager is configured. */
  private inTransaction<T>(work: () => Promise<T>): Promise<T> {
    return this.transactionManager ? this.transactionManager.run(() => work()) : work();
  }

  /** The assigned agent must be active staff of the same organization. */
  private async assertAssignableAgent(agentId: string, tenantId: string): Promise<void> {
    if (!this.userRepo) return;

    const agent = await this.userRepo.findById(agentId, tenantId);
    const role = agent?.role;

    if (!agent || (role !== 'AGENT' && role !== 'TENANT_MANAGER')) {
      throw new ValidationError(
        'Assigned agent must be a staff member of this organization',
      );
    }
  }

  async createCustomer(dto: CreateCustomerDto): Promise<CustomerEntity> {
    // Check for duplicate email within tenant
    const exists = await this.customerRepo.existsByEmail(dto.email, dto.tenantId);

    if (exists) {
      throw new ConflictError(
        'A customer with this email already exists in your organization',
      );
    }

    if (dto.assignedAgentId) {
      await this.assertAssignableAgent(dto.assignedAgentId, dto.tenantId);
    }

    const customerId = crypto.randomUUID();

    const customer = CustomerEntity.create(customerId, {
      tenantId: dto.tenantId,
      assignedAgentId: dto.assignedAgentId,
      fullName: dto.fullName,
      email: Email.create(dto.email),
      phone: dto.phone,
      company: dto.company,
      notes: dto.notes,
      status: CustomerStatusEnum.ACTIVE,
      riskScore: 0,
      metadata: {},
      externalId: dto.externalId,
    });

    const saved = await this.inTransaction(async () => {
      const saved = await this.customerRepo.save(customer);

      await this.activityRepo.create({
        tenantId: dto.tenantId,
        customerId: saved.id,
        actorId: dto.createdById,
        actorRole: dto.createdByRole,
        eventType: 'CUSTOMER_CREATED',
        description: `Customer ${dto.fullName} created`,
        newValue: { customerId: saved.id, email: dto.email },
      });

      await this.auditRepo.create({
        tenantId: dto.tenantId,
        actorId: dto.createdById,
        actorRole: dto.createdByRole,
        action: 'CREATE',
        resource: 'customers',
        resourceId: saved.id,
        newValue: { fullName: dto.fullName, email: dto.email },
      });

      // Events live on the aggregate that raised them; the repository returns a fresh copy.
      const events = customer.pullDomainEvents();
      await this.eventBus.publishAll(events);

      return saved;
    });

    logger.info('Customer created', {
      customerId: saved.id,
      tenantId: dto.tenantId,
    });

    return saved;
  }

  async updateCustomer(dto: UpdateCustomerDto): Promise<CustomerEntity> {
    const customer = await this.getCustomerOrThrow(dto.customerId, dto.tenantId);

    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};

    const profileFields = ['fullName', 'phone', 'company', 'notes'] as const;
    for (const field of profileFields) {
      const value = dto[field];
      if (value !== undefined && value !== customer[field]) {
        oldValues[field] = customer[field];
        newValues[field] = value;
      }
    }

    customer.updateProfile({
      fullName: dto.fullName,
      phone: dto.phone,
      company: dto.company,
      notes: dto.notes,
    });

    if (dto.assignedAgentId && dto.assignedAgentId !== customer.assignedAgentId) {
      await this.assertAssignableAgent(dto.assignedAgentId, dto.tenantId);
      oldValues.assignedAgentId = customer.assignedAgentId;
      newValues.assignedAgentId = dto.assignedAgentId;
      customer.assignAgent(dto.assignedAgentId);
    }

    if (dto.status && dto.status !== customer.status) {
      oldValues.status = customer.status;
      newValues.status = dto.status;
      if (dto.status === 'BLOCKED') customer.block();
      if (dto.status === 'ACTIVE') customer.activate();
      if (dto.status === 'INACTIVE') customer.deactivate();
    }

    const updated = await this.inTransaction(async () => {
      const updated = await this.customerRepo.update(customer);

      if (Object.keys(newValues).length > 0) {
        await this.activityRepo.create({
          tenantId: dto.tenantId,
          customerId: dto.customerId,
          actorId: dto.updatedById,
          actorRole: dto.updatedByRole,
          eventType: 'CUSTOMER_UPDATED',
          description: 'Customer profile updated',
          oldValue: oldValues,
          newValue: newValues,
        });

        await this.auditRepo.create({
          tenantId: dto.tenantId,
          actorId: dto.updatedById,
          actorRole: dto.updatedByRole,
          action: 'UPDATE',
          resource: 'customers',
          resourceId: dto.customerId,
          oldValue: oldValues,
          newValue: newValues,
        });
      }

      return updated;
    });

    return updated;
  }

  async deleteCustomer(
    customerId: string,
    tenantId: string,
    deletedById: string,
    deletedByRole: string,
  ): Promise<void> {
    await this.getCustomerOrThrow(customerId, tenantId);

    // Tickets reference their customer; deleting would fail on the foreign key.
    if (await this.customerRepo.hasTickets(customerId, tenantId)) {
      throw new ConflictError(
        'This customer has tickets and cannot be deleted. Block or deactivate the customer instead.',
      );
    }

    await this.inTransaction(async () => {
      await this.customerRepo.delete(customerId, tenantId);

      await this.auditRepo.create({
        tenantId,
        actorId: deletedById,
        actorRole: deletedByRole,
        action: 'DELETE',
        resource: 'customers',
        resourceId: customerId,
      });
    });
  }

  async getCustomer(customerId: string, tenantId: string): Promise<CustomerEntity> {
    return this.getCustomerOrThrow(customerId, tenantId);
  }

  async listCustomers(
    filters: CustomerFilters,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<CustomerEntity>> {
    return this.customerRepo.findAll(filters, pagination);
  }

  async getCustomerTimeline(
    customerId: string,
    tenantId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{
    data: unknown[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    await this.getCustomerOrThrow(customerId, tenantId);
    return this.activityRepo.findByCustomer(customerId, tenantId, page, limit);
  }

  async triggerRiskScoreUpdate(customerId: string, tenantId: string): Promise<void> {
    const customer = await this.getCustomerOrThrow(customerId, tenantId);

    await this.aiQueue.add({
      jobType: 'risk-score',
      tenantId,
      customerId,
      content: JSON.stringify({
        email: customer.email,
        company: customer.company,
        riskScore: customer.riskScore,
        status: customer.status,
      }),
    });
  }

  async updateRiskScore(
    customerId: string,
    tenantId: string,
    score: number,
    label: string,
  ): Promise<CustomerEntity> {
    const customer = await this.getCustomerOrThrow(customerId, tenantId);

    customer.updateRiskScore(score, label);
    const updated = await this.customerRepo.update(customer);

    await this.activityRepo.create({
      tenantId,
      customerId,
      eventType: 'CUSTOMER_RISK_UPDATED',
      description: `Risk score updated to ${score} (${label})`,
      newValue: { score, label },
    });

    const events = customer.pullDomainEvents();
    await this.eventBus.publishAll(events);

    return updated;
  }

  private async getCustomerOrThrow(
    id: string,
    tenantId: string,
  ): Promise<CustomerEntity> {
    const customer = await this.customerRepo.findById(id, tenantId);

    if (!customer) {
      throw new NotFoundError('Customer', id);
    }

    return customer;
  }
}
