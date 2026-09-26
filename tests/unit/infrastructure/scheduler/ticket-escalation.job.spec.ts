import { mockDeep } from 'jest-mock-extended';

import type { TicketService } from '../../../../src/application/ticket/services/ticket.service';
import type { ITenantRepository } from '../../../../src/domain/tenant/repositories/tenant.repository.interface';
import { TicketEntity } from '../../../../src/domain/ticket/entities/ticket.entity';
import type { ITicketRepository } from '../../../../src/domain/ticket/repositories/ticket.repository.interface';
import { TicketPriority } from '../../../../src/domain/ticket/value-objects/ticket-priority.vo';
import { TicketStatus } from '../../../../src/domain/ticket/value-objects/ticket-status.vo';
import { createTicketEscalationJob } from '../../../../src/infrastructure/scheduler/ticket-escalation.job';

const overdueTicket = (id: string, isEscalated = false) =>
  TicketEntity.reconstitute(id, {
    tenantId: 'tenant-1',
    ticketNumber: 1,
    customerId: 'customer-1',
    createdById: 'user-1',
    title: 'Overdue',
    description: 'Overdue ticket',
    status: TicketStatus.open(),
    priority: TicketPriority.medium(),
    category: 'GENERAL',
    tags: [],
    source: 'web',
    isEscalated,
    slaBreached: false,
    dueAt: new Date(Date.now() - 60_000),
    metadata: {},
  });

describe('ticket escalation job', () => {
  const setup = (tenantPages: string[][]) => {
    const ticketService = mockDeep<TicketService>();
    const ticketRepo = mockDeep<ITicketRepository>();
    const tenantRepo = mockDeep<ITenantRepository>();

    tenantRepo.findAll.mockImplementation((_filters, page) => {
      const ids = tenantPages[page - 1] ?? [];
      return Promise.resolve({
        data: ids.map((id) => ({ id })),
        total: tenantPages.flat().length,
        page,
        limit: 200,
        totalPages: tenantPages.length,
      } as never);
    });
    ticketRepo.markSlaBreached.mockResolvedValue(true);

    return {
      ticketService,
      ticketRepo,
      job: createTicketEscalationJob(ticketService, ticketRepo, tenantRepo),
    };
  };

  it('keeps escalating other tickets after one fails', async () => {
    const { ticketService, ticketRepo, job } = setup([['tenant-1']]);
    ticketRepo.findOverdueTickets.mockResolvedValue([
      overdueTicket('t1'),
      overdueTicket('t2'),
    ]);
    ticketService.escalateTicket
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined as never);

    await job();

    expect(ticketService.escalateTicket).toHaveBeenCalledTimes(2);
  });

  it('marks every overdue ticket as SLA breached, escalating only when allowed', async () => {
    const { ticketService, ticketRepo, job } = setup([['tenant-1']]);
    ticketRepo.findOverdueTickets.mockResolvedValue([
      overdueTicket('t1'),
      overdueTicket('t2', true),
    ]);

    await job();

    expect(ticketRepo.markSlaBreached).toHaveBeenCalledWith('t1', 'tenant-1');
    expect(ticketRepo.markSlaBreached).toHaveBeenCalledWith('t2', 'tenant-1');
    expect(ticketService.escalateTicket).toHaveBeenCalledTimes(1);
    expect(ticketService.escalateTicket).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: 't1', escalatedByRole: 'SYSTEM' }),
    );
  });

  it('processes every page of tenants', async () => {
    const { ticketRepo, job } = setup([['a', 'b'], ['c']]);
    ticketRepo.findOverdueTickets.mockResolvedValue([]);

    await job();

    expect(ticketRepo.findOverdueTickets.mock.calls.map(([id]) => id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});
