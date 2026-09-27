import crypto from 'crypto';

import type { PrismaClient } from '@prisma/client';

import type { ProcessInboundWhatsAppHandler } from '../../../src/application/messaging/handlers/process-inbound-whatsapp.handler';
import { WebhookProcessingService } from '../../../src/application/messaging/services/webhook-processing.service';
import type { IWhatsAppProvider } from '../../../src/infrastructure/messaging/whatsapp/whatsapp-provider.interface';
import { OutboxRepository } from '../../../src/infrastructure/outbox/outbox.repository';
import { disconnectTestDatabase, getTestPrisma } from '../../helpers/test-db';

describe('Operator replay under concurrent workers (Integration)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = getTestPrisma();
  });
  beforeEach(async () => {
    await prisma.outboxEvent.deleteMany();
    await prisma.webhookEvent.deleteMany();
  });
  afterAll(async () => {
    await prisma.outboxEvent.deleteMany();
    await prisma.webhookEvent.deleteMany();
    await disconnectTestDatabase();
  });

  it('delivers a replayed outbox event to exactly one of several workers', async () => {
    const originalId = crypto.randomUUID();
    await prisma.outboxEvent.create({
      data: {
        id: originalId,
        eventId: crypto.randomUUID(),
        eventType: 'TEST_EVENT',
        occurredAt: new Date(),
        payload: {},
        status: 'PROCESSED',
      },
    });
    await prisma.outboxEvent.create({
      data: {
        id: crypto.randomUUID(),
        eventId: crypto.randomUUID(),
        replayOfId: originalId,
        eventType: 'TEST_EVENT',
        occurredAt: new Date(),
        payload: {},
        status: 'PENDING',
      },
    });

    const repository = new OutboxRepository(prisma);
    const batches = await Promise.all(
      ['worker-a', 'worker-b', 'worker-c'].map((worker) =>
        repository.claimBatch(worker, 10),
      ),
    );
    const claimed = batches.flat();
    expect(claimed).toHaveLength(1);
    expect(claimed[0].id).not.toBe(originalId);
  });

  it('refuses a second active replay of the same event at the database level', async () => {
    const originalId = crypto.randomUUID();
    const replay = (status: string) =>
      prisma.outboxEvent.create({
        data: {
          id: crypto.randomUUID(),
          eventId: crypto.randomUUID(),
          replayOfId: originalId,
          eventType: 'TEST_EVENT',
          occurredAt: new Date(),
          payload: {},
          status,
        },
      });
    await replay('PENDING');
    await expect(replay('PENDING')).rejects.toMatchObject({ code: 'P2002' });
    // Finished replays do not block a new one.
    await prisma.outboxEvent.updateMany({
      where: { replayOfId: originalId },
      data: { status: 'PROCESSED' },
    });
    await expect(replay('PENDING')).resolves.toBeDefined();
  });

  it('processes a stored webhook once when retried concurrently', async () => {
    const event = await prisma.webhookEvent.create({
      data: {
        eventType: 'WHATSAPP_INBOUND',
        provider: 'twilio',
        payload: { From: 'whatsapp:+1', To: 'whatsapp:+2', Body: 'hello' },
        status: 'FAILED',
      },
    });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const execute = jest.fn(async () => {
      await gate;
      return { status: 'ticket-created' as const, ticketId: 'ticket' };
    });
    const service = new WebhookProcessingService(
      prisma,
      {
        parseInboundMessage: () => ({
          from: '+1',
          to: '+2',
          body: 'hello',
          messageId: 'm',
          timestamp: '',
        }),
      } as unknown as IWhatsAppProvider,
      { execute } as unknown as ProcessInboundWhatsAppHandler,
    );

    const first = service.process(event.id);
    // Let the first claim land before racing the others.
    for (let i = 0; i < 50 && execute.mock.calls.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const others = await Promise.all([
      service.process(event.id),
      service.process(event.id),
    ]);
    release();

    expect(await first).toEqual({ status: 'PROCESSED' });
    expect(others).toEqual([{ status: 'NOT_CLAIMED' }, { status: 'NOT_CLAIMED' }]);
    expect(execute).toHaveBeenCalledTimes(1);
    // PROCESSED is terminal: later retries do nothing.
    expect(await service.process(event.id)).toEqual({ status: 'NOT_CLAIMED' });
    const row = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(row).toMatchObject({ status: 'PROCESSED', processed: true, lockedBy: null });
  });
});
