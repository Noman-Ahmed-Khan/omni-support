import { TicketEntity } from '../../../../src/domain/ticket/entities/ticket.entity';
import { TicketStatus } from '../../../../src/domain/ticket/value-objects/ticket-status.vo';
import { TicketPriority } from '../../../../src/domain/ticket/value-objects/ticket-priority.vo';
import { TicketCreatedEvent } from '../../../../src/domain/ticket/events/ticket-created.event';
import { TicketAssignedEvent } from '../../../../src/domain/ticket/events/ticket-assigned.event';
import { TicketEscalatedEvent } from '../../../../src/domain/ticket/events/ticket-escalated.event';
import { DomainError } from '../../../../src/shared/errors/domain.error';

describe('TicketEntity', () => {
  const baseProps = {
    tenantId: 'tenant-1',
    ticketNumber: 1,
    customerId: 'customer-1',
    createdById: 'user-1',
    title: 'Test Ticket',
    description: 'Test Description',
    status: TicketStatus.open(),
    priority: TicketPriority.medium(),
    category: 'GENERAL',
    tags: [],
    source: 'web',
    isEscalated: false,
    slaBreached: false,
    metadata: {},
  };

  describe('create()', () => {
    it('should create a ticket with correct properties', () => {
      const ticket = TicketEntity.create('ticket-id', baseProps);

      expect(ticket.id).toBe('ticket-id');
      expect(ticket.tenantId).toBe('tenant-1');
      expect(ticket.title).toBe('Test Ticket');
      expect(ticket.status).toBe('OPEN');
      expect(ticket.priority).toBe('MEDIUM');
      expect(ticket.isEscalated).toBe(false);
    });

    it('should emit TicketCreatedEvent on creation', () => {
      const ticket = TicketEntity.create('ticket-id', baseProps);
      const events = ticket.pullDomainEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TicketCreatedEvent);
      expect((events[0] as TicketCreatedEvent).ticketId).toBe('ticket-id');
      expect((events[0] as TicketCreatedEvent).tenantId).toBe('tenant-1');
    });

    it('should clear events after pulling', () => {
      const ticket = TicketEntity.create('ticket-id', baseProps);
      ticket.pullDomainEvents();

      const events = ticket.pullDomainEvents();
      expect(events).toHaveLength(0);
    });
  });

  describe('changeStatus()', () => {
    it('should transition from OPEN to IN_PROGRESS', () => {
      const ticket = TicketEntity.create('ticket-id', baseProps);
      ticket.pullDomainEvents(); // Clear creation events

      ticket.changeStatus(TicketStatus.create('IN_PROGRESS'), 'agent-1');

      expect(ticket.status).toBe('IN_PROGRESS');
    });

    it('should set resolvedAt when transitioning to RESOLVED', () => {
      const ticket = TicketEntity.create('ticket-id', {
        ...baseProps,
        status: TicketStatus.create('IN_PROGRESS'),
      });

      ticket.changeStatus(TicketStatus.create('RESOLVED'), 'agent-1');

      expect(ticket.status).toBe('RESOLVED');
      expect(ticket.resolvedAt).toBeInstanceOf(Date);
    });

    it('should throw when transitioning from OPEN directly to RESOLVED', () => {
      const ticket = TicketEntity.create('ticket-id', baseProps);

      expect(() =>
        ticket.changeStatus(TicketStatus.create('RESOLVED'), 'agent-1'),
      ).toThrow();
    });

    it('should not allow any transitions from CLOSED', () => {
      const ticket = TicketEntity.create('ticket-id', {
        ...baseProps,
        status: TicketStatus.create('CLOSED'),
      });

      expect(() =>
        ticket.changeStatus(TicketStatus.create('OPEN'), 'agent-1'),
      ).toThrow();
    });
  });

  describe('assign()', () => {
    it('should assign ticket to agent and emit event', () => {
      const ticket = TicketEntity.create('ticket-id', baseProps);
      ticket.pullDomainEvents();

      ticket.assign('agent-1', 'manager-1');

      expect(ticket.assignedAgentId).toBe('agent-1');

      const events = ticket.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TicketAssignedEvent);
    });

    it('should set firstResponseAt on first assignment', () => {
      const ticket = TicketEntity.create('ticket-id', baseProps);

      expect(ticket.firstResponseAt).toBeUndefined();

      ticket.assign('agent-1', 'manager-1');

      expect(ticket.firstResponseAt).toBeInstanceOf(Date);
    });

    it('should not reset firstResponseAt on reassignment', () => {
      const ticket = TicketEntity.create('ticket-id', baseProps);
      ticket.assign('agent-1', 'manager-1');

      const firstResponseAt = ticket.firstResponseAt;

      ticket.assign('agent-2', 'manager-1');

      expect(ticket.firstResponseAt).toEqual(firstResponseAt);
    });
  });

  describe('escalate()', () => {
    it('should escalate ticket and set priority to CRITICAL', () => {
      const ticket = TicketEntity.create('ticket-id', baseProps);
      ticket.pullDomainEvents();

      ticket.escalate('High urgency customer', 'manager-1');

      expect(ticket.isEscalated).toBe(true);
      expect(ticket.priority).toBe('CRITICAL');
      expect(ticket.escalatedAt).toBeInstanceOf(Date);
      expect(ticket.escalatedReason).toBe('High urgency customer');

      const events = ticket.pullDomainEvents();
      const escalatedEvent = events.find((e) => e instanceof TicketEscalatedEvent);
      expect(escalatedEvent).toBeDefined();
    });

    it('should throw when escalating already escalated ticket', () => {
      const ticket = TicketEntity.create('ticket-id', {
        ...baseProps,
        isEscalated: true,
      });

      expect(() =>
        ticket.escalate('Another reason', 'manager-1'),
      ).toThrow('Ticket is already escalated');
    });
  });
});