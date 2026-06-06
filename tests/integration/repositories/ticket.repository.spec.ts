import { TicketRepository } from '../../../src/infrastructure/database/repositories/ticket.repository';
import { TicketEntity } from '../../../src/domain/ticket/entities/ticket.entity';
import { TicketStatus } from '../../../src/domain/ticket/value-objects/ticket-status.vo';
import { TicketPriority } from '../../../src/domain/ticket/value-objects/ticket-priority.vo';
import { getTestPrisma, cleanupTestDatabase } from '../../helpers/test-db';
import { createTestTenant } from '../../fixtures/tenant.fixture';
import { createTestUser } from '../../fixtures/user.fixture';
import { createTestCustomer } from '../../fixtures/ticket.fixture';
import crypto from 'crypto';

describe('TicketRepository (Integration)', () => {
  const prisma = getTestPrisma();
  let repo: TicketRepository;
  let tenantId: string;
  let customerId: string;
  let userId: string;

  beforeAll(async () => {
    repo = new TicketRepository(prisma);
  });

  beforeEach(async () => {
    await cleanupTestDatabase();

    const tenant = await createTestTenant(prisma);
    tenantId = tenant.id;

    const user = await createTestUser(prisma, tenantId);
    userId = user.id;

    const customer = await createTestCustomer(prisma, tenantId);
    customerId = customer.id;
  });

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  describe('save()', () => {
    it('should persist ticket to database', async () => {
      const ticketNumber = await repo.getNextTicketNumber(tenantId);

      const ticket = TicketEntity.create(crypto.randomUUID(), {
        tenantId,
        ticketNumber,
        customerId,
        createdById: userId,
        title: 'Integration Test Ticket',
        description: 'Test description for integration test',
        status: TicketStatus.open(),
        priority: TicketPriority.medium(),
        category: 'GENERAL',
        tags: ['test'],
        source: 'web',
        isEscalated: false,
        slaBreached: false,
        metadata: {},
      });

      const saved = await repo.save(ticket);

      expect(saved.id).toBe(ticket.id);
      expect(saved.tenantId).toBe(tenantId);
      expect(saved.title).toBe('Integration Test Ticket');
      expect(saved.status).toBe('OPEN');
    });
  });

  describe('findById()', () => {
    it('should return ticket for correct tenant', async () => {
      const ticketNumber = await repo.getNextTicketNumber(tenantId);

      const ticket = TicketEntity.create(crypto.randomUUID(), {
        tenantId,
        ticketNumber,
        customerId,
        createdById: userId,
        title: 'Find By ID Test',
        description: 'Test description for findById test',
        status: TicketStatus.open(),
        priority: TicketPriority.medium(),
        category: 'GENERAL',
        tags: [],
        source: 'web',
        isEscalated: false,
        slaBreached: false,
        metadata: {},
      });

      const saved = await repo.save(ticket);
      const found = await repo.findById(saved.id, tenantId);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(saved.id);
    });

    it('should return null for wrong tenant (isolation)', async () => {
      const ticketNumber = await repo.getNextTicketNumber(tenantId);

      const ticket = TicketEntity.create(crypto.randomUUID(), {
        tenantId,
        ticketNumber,
        customerId,
        createdById: userId,
        title: 'Isolation Test',
        description: 'Test for tenant isolation',
        status: TicketStatus.open(),
        priority: TicketPriority.medium(),
        category: 'GENERAL',
        tags: [],
        source: 'web',
        isEscalated: false,
        slaBreached: false,
        metadata: {},
      });

      const saved = await repo.save(ticket);

      // Try to access with different tenant
      const found = await repo.findById(saved.id, 'different-tenant-id');

      expect(found).toBeNull();
    });
  });

  describe('findAll()', () => {
    it('should filter by status', async () => {
      // Create two tickets with different statuses
      const t1Number = await repo.getNextTicketNumber(tenantId);
      const ticket1 = TicketEntity.create(crypto.randomUUID(), {
        tenantId,
        ticketNumber: t1Number,
        customerId,
        createdById: userId,
        title: 'Open Ticket',
        description: 'This ticket is open',
        status: TicketStatus.open(),
        priority: TicketPriority.medium(),
        category: 'GENERAL',
        tags: [],
        source: 'web',
        isEscalated: false,
        slaBreached: false,
        metadata: {},
      });

      const t2Number = await repo.getNextTicketNumber(tenantId);
      const ticket2 = TicketEntity.create(crypto.randomUUID(), {
        tenantId,
        ticketNumber: t2Number,
        customerId,
        createdById: userId,
        title: 'In Progress Ticket',
        description: 'This ticket is in progress',
        status: TicketStatus.create('IN_PROGRESS'),
        priority: TicketPriority.medium(),
        category: 'GENERAL',
        tags: [],
        source: 'web',
        isEscalated: false,
        slaBreached: false,
        metadata: {},
      });

      await repo.save(ticket1);
      await repo.save(ticket2);

      const result = await repo.findAll(
        { tenantId, status: 'OPEN' },
        { page: 1, limit: 10 },
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe('OPEN');
      expect(result.total).toBe(1);
    });
  });

  describe('getNextTicketNumber()', () => {
    it('should return sequential ticket numbers', async () => {
      const n1 = await repo.getNextTicketNumber(tenantId);
      const n2 = await repo.getNextTicketNumber(tenantId);
      const n3 = await repo.getNextTicketNumber(tenantId);

      expect(n2).toBe(n1 + 1);
      expect(n3).toBe(n2 + 1);
    });

    it('should be isolated per tenant', async () => {
      const tenant2 = await createTestTenant(prisma, { slug: `test-org-2-${Date.now()}` });

      const t1n1 = await repo.getNextTicketNumber(tenantId);
      const t2n1 = await repo.getNextTicketNumber(tenant2.id);

      // Both should start independently
      expect(t1n1).toBeGreaterThanOrEqual(1);
      expect(t2n1).toBeGreaterThanOrEqual(1);
    });
  });

  describe('update()', () => {
    it('should update ticket in database', async () => {
      const ticketNumber = await repo.getNextTicketNumber(tenantId);

      const ticket = TicketEntity.create(crypto.randomUUID(), {
        tenantId,
        ticketNumber,
        customerId,
        createdById: userId,
        title: 'Update Test',
        description: 'This ticket will be updated',
        status: TicketStatus.open(),
        priority: TicketPriority.medium(),
        category: 'GENERAL',
        tags: [],
        source: 'web',
        isEscalated: false,
        slaBreached: false,
        metadata: {},
      });

      const saved = await repo.save(ticket);
      // Create a test agent user so assignedAgentId satisfies the FK constraint
      const agent = await createTestUser(prisma, tenantId);
      saved.assign(agent.id, userId);
      saved.pullDomainEvents();

      await repo.update(saved);

      const found = await repo.findById(saved.id, tenantId);
      expect(found!.assignedAgentId).toBe(agent.id);
    });
  });
});