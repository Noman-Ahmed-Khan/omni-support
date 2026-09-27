import type { PrismaClient } from '@prisma/client';
import { mockDeep } from 'jest-mock-extended';

import { ProcessInboundWhatsAppHandler } from '../../../../src/application/messaging/handlers/process-inbound-whatsapp.handler';
import type { TicketService } from '../../../../src/application/ticket/services/ticket.service';

describe('ProcessInboundWhatsAppHandler', () => {
  const prisma = mockDeep<PrismaClient>();
  const tickets = mockDeep<TicketService>();
  const handler = new ProcessInboundWhatsAppHandler(prisma, tickets);
  const message = {
    from: '+15550100001',
    to: '+15550100002',
    body: 'Where is my order?',
    messageId: 'SM1',
    timestamp: '',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.tenantIntegration.findMany.mockResolvedValue([
      { tenantId: 'tenant', config: { phoneNumber: '+15550100002' } },
    ] as never);
    prisma.customer.findFirst.mockResolvedValue({
      id: 'customer',
      email: 'buyer@example.com',
      fullName: 'Buyer',
    } as never);
  });

  it('does not author as a customer account matched only by email', async () => {
    prisma.customerLink.findFirst.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue({ id: 'same-email-user' } as never);

    await expect(handler.execute(message)).resolves.toMatchObject({ status: 'skipped' });
    expect(tickets.createTicket).not.toHaveBeenCalled();
  });

  it('authors as the linked portal account', async () => {
    prisma.customerLink.findFirst.mockResolvedValue({ userId: 'linked-user' } as never);
    prisma.ticket.findFirst.mockResolvedValue(null);
    tickets.createTicket.mockResolvedValue({ id: 'ticket' } as never);
    prisma.ticket.updateMany.mockResolvedValue({ count: 1 });

    await expect(handler.execute(message)).resolves.toEqual({
      status: 'ticket-created',
      ticketId: 'ticket',
    });
    expect(prisma.customerLink.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant', customerId: 'customer' }),
      }),
    );
    expect(tickets.createTicket).toHaveBeenCalledWith(
      expect.objectContaining({ createdById: 'linked-user', customerId: 'customer' }),
    );
  });
});
