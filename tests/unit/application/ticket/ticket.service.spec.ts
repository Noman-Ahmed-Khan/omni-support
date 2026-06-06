import { TicketService } from '../../../../src/application/ticket/services/ticket.service';
import { mockDeep, MockProxy } from 'jest-mock-extended';
import { ITicketRepository } from '../../../../src/domain/ticket/repositories/ticket.repository.interface';
import { ICustomerRepository } from '../../../../src/domain/customer/repositories/customer.repository.interface';
import { PrismaClient } from '@prisma/client';
import { IEventBus } from '../../../../src/application/event-bus/event-bus.interface';
import { AIQueue } from '../../../../src/infrastructure/queue/queues/ai.queue';
import { ActivityRepository } from '../../../../src/infrastructure/database/repositories/activity.repository';
import { AuditRepository } from '../../../../src/infrastructure/database/repositories/audit.repository';
import { DashboardCacheStrategy } from '../../../../src/infrastructure/cache/strategies/dashboard.cache';
import { CustomerEntity } from '../../../../src/domain/customer/entities/customer.entity';
import { TicketEntity } from '../../../../src/domain/ticket/entities/ticket.entity';
import { TicketStatus } from '../../../../src/domain/ticket/value-objects/ticket-status.vo';
import { TicketPriority } from '../../../../src/domain/ticket/value-objects/ticket-priority.vo';
import { NotFoundError } from '../../../../src/shared/errors/domain.error';
import { Email } from '../../../../src/domain/user/value-objects/email.vo';

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

    ticketService = new TicketService(
      ticketRepo,
      customerRepo,
      prisma,
      eventBus,
      aiQueue,
      activityRepo,
      auditRepo,
      dashboardCache,
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
      (prisma.ticket.count as jest.Mock).mockResolvedValue(0);
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

    it('should throw NotFoundError when customer does not exist', async () => {
      customerRepo.findById.mockResolvedValue(null);

      await expect(ticketService.createTicket(createDto)).rejects.toThrow(
        NotFoundError,
      );
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

      const { ForbiddenError } = await import(
        '../../../../src/shared/errors/application.error'
      );

      await expect(ticketService.createTicket(createDto)).rejects.toThrow(
        ForbiddenError,
      );
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
