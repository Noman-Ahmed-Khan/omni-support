import { mockDeep } from 'jest-mock-extended';

import { InProcessEventBus } from '../../../src/application/event-bus/event-bus';
import type { IEventBus } from '../../../src/application/event-bus/event-bus.interface';
import { TicketService } from '../../../src/application/ticket/services/ticket.service';
import type { DashboardCacheStrategy } from '../../../src/infrastructure/cache/strategies/dashboard.cache';
import { ActivityRepository } from '../../../src/infrastructure/database/repositories/activity.repository';
import { AuditRepository } from '../../../src/infrastructure/database/repositories/audit.repository';
import { CommentRepository } from '../../../src/infrastructure/database/repositories/comment.repository';
import { CustomerRepository } from '../../../src/infrastructure/database/repositories/customer.repository';
import { TicketRepository } from '../../../src/infrastructure/database/repositories/ticket.repository';
import { OutboxPublisher } from '../../../src/infrastructure/outbox/outbox.publisher';
import { OutboxRepository } from '../../../src/infrastructure/outbox/outbox.repository';
import type { AIQueue } from '../../../src/infrastructure/queue/queues/ai.queue';
import { createTestTenant } from '../../fixtures/tenant.fixture';
import { createTestCustomer } from '../../fixtures/ticket.fixture';
import { createTestUser } from '../../fixtures/user.fixture';
import { cleanupTestDatabase, getTestPrisma } from '../../helpers/test-db';

describe('TicketService transactions (Integration)', () => {
  const prisma = getTestPrisma();
  let tenantId: string;
  let customerId: string;
  let userId: string;

  const buildService = (eventBus: IEventBus) => {
    const aiQueue = mockDeep<AIQueue>();
    const dashboardCache = mockDeep<DashboardCacheStrategy>();

    return {
      aiQueue,
      service: new TicketService(
        new TicketRepository(prisma),
        new CustomerRepository(prisma),
        prisma,
        eventBus,
        aiQueue,
        new ActivityRepository(prisma),
        new AuditRepository(prisma),
        dashboardCache,
        new CommentRepository(prisma),
      ),
    };
  };

  const createDto = () => ({
    tenantId,
    customerId,
    createdById: userId,
    createdByRole: 'TENANT_MANAGER',
    title: 'Printer on fire',
    description: 'The office printer is on fire again',
  });

  beforeEach(async () => {
    await cleanupTestDatabase();
    tenantId = (await createTestTenant(prisma)).id;
    userId = (await createTestUser(prisma, tenantId)).id;
    customerId = (await createTestCustomer(prisma, tenantId)).id;
  });

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  it('commits the ticket, its activity, audit record and outbox events together', async () => {
    const outbox = new OutboxRepository(prisma);
    const { service, aiQueue } = buildService(
      new OutboxPublisher(outbox, new InProcessEventBus()),
    );

    const ticket = await service.createTicket(createDto());

    expect(await prisma.ticket.count({ where: { id: ticket.id } })).toBe(1);
    expect(await prisma.activityLog.count({ where: { ticketId: ticket.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { resourceId: ticket.id } })).toBe(1);
    expect(
      await prisma.outboxEvent.count({ where: { aggregateId: ticket.id } }),
    ).toBeGreaterThan(0);
    expect(aiQueue.addTicketAnalysis).toHaveBeenCalledTimes(1);
  });

  it('rolls everything back when writing the outbox fails', async () => {
    const failingBus = mockDeep<IEventBus>();
    failingBus.publishAll.mockRejectedValue(new Error('outbox unavailable'));
    const { service, aiQueue } = buildService(failingBus);

    await expect(service.createTicket(createDto())).rejects.toThrow('outbox unavailable');

    expect(await prisma.ticket.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.activityLog.count({ where: { tenantId } })).toBe(0);
    expect(
      await prisma.auditLog.count({ where: { tenantId, resource: 'tickets' } }),
    ).toBe(0);
    expect(aiQueue.addTicketAnalysis).not.toHaveBeenCalled();

    // The ticket number was not consumed by the failed attempt.
    const sequence = await prisma.ticketSequence.findUnique({ where: { tenantId } });
    expect(sequence?.lastNumber ?? 0).toBe(0);
  });

  it('never exceeds the daily ticket limit under concurrent creates', async () => {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { maxTicketsPerDay: 3 },
    });
    const { service } = buildService(
      new OutboxPublisher(new OutboxRepository(prisma), new InProcessEventBus()),
    );

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => service.createTicket(createDto())),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(await prisma.ticket.count({ where: { tenantId } })).toBe(3);
  });
});
