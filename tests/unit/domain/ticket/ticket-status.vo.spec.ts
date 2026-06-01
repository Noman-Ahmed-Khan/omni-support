import { TicketStatus } from '../../../../src/domain/ticket/value-objects/ticket-status.vo';

describe('TicketStatus', () => {
  describe('create()', () => {
    it('should create valid statuses', () => {
      expect(() => TicketStatus.create('OPEN')).not.toThrow();
      expect(() => TicketStatus.create('IN_PROGRESS')).not.toThrow();
      expect(() => TicketStatus.create('PENDING_CUSTOMER')).not.toThrow();
      expect(() => TicketStatus.create('RESOLVED')).not.toThrow();
      expect(() => TicketStatus.create('CLOSED')).not.toThrow();
    });

    it('should throw for invalid status', () => {
      expect(() => TicketStatus.create('INVALID')).toThrow();
      expect(() => TicketStatus.create('')).toThrow();
    });
  });

  describe('canTransitionTo()', () => {
    it('should allow OPEN -> IN_PROGRESS', () => {
      const open = TicketStatus.create('OPEN');
      const inProgress = TicketStatus.create('IN_PROGRESS');
      expect(open.canTransitionTo(inProgress)).toBe(true);
    });

    it('should allow OPEN -> CLOSED', () => {
      const open = TicketStatus.create('OPEN');
      const closed = TicketStatus.create('CLOSED');
      expect(open.canTransitionTo(closed)).toBe(true);
    });

    it('should NOT allow OPEN -> RESOLVED', () => {
      const open = TicketStatus.create('OPEN');
      const resolved = TicketStatus.create('RESOLVED');
      expect(open.canTransitionTo(resolved)).toBe(false);
    });

    it('should NOT allow CLOSED -> any', () => {
      const closed = TicketStatus.create('CLOSED');
      expect(closed.canTransitionTo(TicketStatus.create('OPEN'))).toBe(false);
      expect(closed.canTransitionTo(TicketStatus.create('IN_PROGRESS'))).toBe(false);
      expect(closed.canTransitionTo(TicketStatus.create('RESOLVED'))).toBe(false);
    });

    it('should allow RESOLVED -> OPEN (reopen)', () => {
      const resolved = TicketStatus.create('RESOLVED');
      const open = TicketStatus.create('OPEN');
      expect(resolved.canTransitionTo(open)).toBe(true);
    });
  });
});