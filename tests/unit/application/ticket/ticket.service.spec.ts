import type { PrismaClient } from '@prisma/client';
import { mockDeep } from 'jest-mock-extended';
import type { MockProxy } from 'jest-mock-extended';

import type { IEventBus } from '../../../../src/application/event-bus/event-bus.interface';
import { TicketService } from '../../../../src/application/ticket/services/ticket.service';
import { CustomerEntity } from '../../../../src/domain/customer/entities/customer.entity';
import type { ICustomerRepository } from '../../../../src/domain/customer/repositories/customer.repository.interface';
import { TicketEntity } from '../../../../src/domain/ticket/entities/ticket.entity';
import type { ICommentRepository } from '../../../../src/domain/ticket/repositories/comment.repository.interface';
import type { ITicketRepository } from '../../../../src/domain/ticket/repositories/ticket.repository.interface';
import { TicketPriority } from '../../../../src/domain/ticket/value-objects/ticket-priority.vo';
import { TicketStatus } from '../../../../src/domain/ticket/value-objects/ticket-status.vo';
import { Email } from '../../../../src/domain/user/value-objects/email.vo';
import type { DashboardCacheStrategy } from '../../../../src/infrastructure/cache/strategies/dashboard.cache';
import type { ActivityRepository } from '../../../../src/infrastructure/database/repositories/activity.repository';
import type { AuditRepository } from '../../../../src/infrastructure/database/repositories/audit.repository';
import type { AIQueue } from '../../../../src/infrastructure/queue/queues/ai.queue';
import { NotFoundError } from '../../../../src/shared/errors/domain.error';

describe('TicketService', () => {
  let ticketService: TicketService;
  let ticketRepo: MockProxy<ITicketRepository>;
  let customerRepo: MockProxy<ICustomerRepository>;
  let prisma: MockProxy<PrismaClient>;
  let eventBus: MockProxy<IEventBus>;
  let aiQueue: MockProxy<AIQueue>;
  let activityRepo: MockProxy<ActivityRepository>;
  let auditRepo: MockProxy<AuditRepository>;
  let dashboardCache: MockProxy<DashboardCacheStrategy>;
  let commentRepo: MockProxy<ICommentRepository>;

  const mockCustomer = CustomerEntity.reconstitute('customer-id', {
    tenantId: 'tenant-id',
    fullName: 'John Customer',
    email: Email.create('john@example.com'),
    status: 'ACTIVE' as any,
    riskScore: 0,
    metadata: {},
  });

  const mockTicket = TicketEntity.reconstitute('ticket-id', {
    tenantId: 'tenant-id',
    ticketNumber: 1,
    customerId: 'customer-id',
    createdById: 'user-id',
    title: 'Test Ticket',
    description: 'Test description for the ticket',
    status: TicketStatus.open(),
    priority: TicketPriority.medium(),
    category: 'GENERAL',
    tags: [],
    source: 'web',
    isEscalated: false,
    slaBreached: false,
    metadata: {},
  });

  beforeEach(() => {
    ticketRepo = mockDeep<ITicketRepository>();
    customerRepo = mockDeep<ICustomerRepository>();
    prisma = mockDeep<PrismaClient>();
    eventBus = mockDeep<IEventBus>();
    aiQueue = mockDeep<AIQueue>();
    activityRepo = mockDeep<ActivityRepository>();
    auditRepo = mockDeep<AuditRepository>();
    dashboardCache = mockDeep<DashboardCacheStrategy>();
    commentRepo = mockDeep<ICommentRepository>();

    ticketService = new TicketService(
      ticketRepo,
      customerRepo,
      prisma,
      eventBus,
      aiQueue,
      activityRepo,
      auditRepo,
      dashboardCache,
      commentRepo,
      // Runs the work inline; transaction semantics are covered by integration tests.
      { run: <T>(work: (client: never) => Promise<T>) => work(undefined as never) },
    );
  });

  describe('createTicket()', () => {
    const createDto = {
      tenantId: 'tenant-id',
      customerId: 'customer-id',
      createdById: 'user-id',
      createdByRole: 'AGENT',
      title: 'Test Ticket',
      description: 'Test description that is long enough',
      priority: 'MEDIUM',
      category: 'GENERAL',
    };

    it('should create ticket successfully', async () => {
      customerRepo.findById.mockResolvedValue(mockCustomer);
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
        id: 'tenant-id',
        name: 'Tenant',
        slug: 'tenant',
        status: 'ACTIVE',
        plan: 'starter',
        domain: null,
        logoUrl: null,
        maxAgents: 10,
        maxCustomers: 1000,
        maxTicketsPerDay: 500,
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        suspendedAt: null,
        suspendedReason: null,
      });
      ticketRepo.countCreatedSince.mockResolvedValue(0);
      ticketRepo.getNextTicketNumber.mockResolvedValue(1);
      ticketRepo.save.mockResolvedValue(mockTicket);
      customerRepo.update.mockResolvedValue(mockCustomer);
      activityRepo.create.mockResolvedValue(undefined);
      auditRepo.create.mockResolvedValue(undefined);
      aiQueue.addTicketAnalysis.mockResolvedValue(undefined);
      eventBus.publishAll.mockResolvedValue(undefined);
      dashboardCache.invalidate.mockResolvedValue(undefined);

      const result = await ticketService.createTicket(createDto);

      expect(result).toBeDefined();
      expect(ticketRepo.save).toHaveBeenCalledTimes(1);
      expect(aiQueue.addTicketAnalysis).toHaveBeenCalledWith(
        expect.any(String),
        'tenant-id',
        expect.any(String),
      );
      expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
    });

    it('does not queue AI analysis when the transactional write fails', async () => {
      customerRepo.findById.mockResolvedValue(mockCustomer);
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
        id: 'tenant-id',
        name: 'Tenant',
        slug: 'tenant',
        status: 'ACTIVE',
        plan: 'starter',
        maxAgents: 10,
        maxCustomers: 1000,
        maxTicketsPerDay: 500,
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      ticketRepo.countCreatedSince.mockResolvedValue(0);
      ticketRepo.getNextTicketNumber.mockResolvedValue(1);
      ticketRepo.save.mockResolvedValue(mockTicket);
      customerRepo.update.mockResolvedValue(mockCustomer);
      activityRepo.create.mockResolvedValue(undefined);
      auditRepo.create.mockResolvedValue(undefined);
      eventBus.publishAll.mockRejectedValue(new Error('outbox insert failed'));

      await expect(ticketService.createTicket(createDto)).rejects.toThrow(
        'outbox insert failed',
      );
      expect(aiQueue.addTicketAnalysis).not.toHaveBeenCalled();
      expect(dashboardCache.invalidate).not.toHaveBeenCalled();
    });

    it('rejects creation once the daily ticket limit is reached', async () => {
      customerRepo.findById.mockResolvedValue(mockCustomer);
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
        id: 'tenant-id',
        name: 'Tenant',
        slug: 'tenant',
        status: 'ACTIVE',
        plan: 'starter',
        maxAgents: 10,
        maxCustomers: 1000,
        maxTicketsPerDay: 5,
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      ticketRepo.getNextTicketNumber.mockResolvedValue(6);
      ticketRepo.countCreatedSince.mockResolvedValue(5);

      await expect(ticketService.createTicket(createDto)).rejects.toThrow(
        'Tenant ticket limit has been reached',
      );
      expect(ticketRepo.save).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError when customer does not exist', async () => {
      customerRepo.findById.mockResolvedValue(null);

      await expect(ticketService.createTicket(createDto)).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError for blocked customer', async () => {
      const blockedCustomer = CustomerEntity.reconstitute('customer-id', {
        tenantId: 'tenant-id',
        fullName: 'Blocked Customer',
        email: Email.create('blocked@example.com'),
        status: 'BLOCKED' as any,
        riskScore: 0,
        metadata: {},
      });

      customerRepo.findById.mockResolvedValue(blockedCustomer);

      const { ForbiddenError } =
        await import('../../../../src/shared/errors/application.error');

      await expect(ticketService.createTicket(createDto)).rejects.toThrow(ForbiddenError);
    });
  });

  describe('assignTicket()', () => {
    it('should assign ticket to agent', async () => {
      ticketRepo.findById.mockResolvedValue(mockTicket);
      (prisma.user.findFirst as jest.Mock).mockResolvedValue({
        id: 'agent-id',
        firstName: 'Agent',
        lastName: 'Smith',
        role: 'AGENT',
      });
      ticketRepo.update.mockResolvedValue(mockTicket);
      activityRepo.create.mockResolvedValue(undefined);
      auditRepo.create.mockResolvedValue(undefined);
      eventBus.publishAll.mockResolvedValue(undefined);
      dashboardCache.invalidate.mockResolvedValue(undefined);

      await ticketService.assignTicket({
        tenantId: 'tenant-id',
        ticketId: 'ticket-id',
        agentId: 'agent-id',
        assignedById: 'manager-id',
        assignedByRole: 'TENANT_MANAGER',
      });

      expect(ticketRepo.update).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundError when agent does not exist', async () => {
      ticketRepo.findById.mockResolvedValue(mockTicket);
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        ticketService.assignTicket({
          tenantId: 'tenant-id',
          ticketId: 'ticket-id',
          agentId: 'nonexistent-agent',
          assignedById: 'manager-id',
          assignedByRole: 'TENANT_MANAGER',
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('escalateTicket()', () => {
    it('should escalate ticket', async () => {
      ticketRepo.findById.mockResolvedValue(mockTicket);
      ticketRepo.update.mockResolvedValue(mockTicket);
      activityRepo.create.mockResolvedValue(undefined);
      auditRepo.create.mockResolvedValue(undefined);
      eventBus.publishAll.mockResolvedValue(undefined);
      dashboardCache.invalidate.mockResolvedValue(undefined);

      await ticketService.escalateTicket({
        tenantId: 'tenant-id',
        ticketId: 'ticket-id',
        reason: 'Customer is very frustrated and needs urgent help',
        escalatedById: 'manager-id',
        escalatedByRole: 'TENANT_MANAGER',
      });

      expect(ticketRepo.update).toHaveBeenCalledTimes(1);
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ESCALATE' }),
      );
    });
  });
});
