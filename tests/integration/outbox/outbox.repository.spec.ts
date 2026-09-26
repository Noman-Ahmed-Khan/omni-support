import type { PrismaClient } from '@prisma/client';

import { BaseDomainEvent } from '../../../src/domain/shared/base.event';
import { OutboxStatus } from '../../../src/infrastructure/outbox/outbox.entity';
import { OutboxRepository } from '../../../src/infrastructure/outbox/outbox.repository';
import { getTestPrisma, disconnectTestDatabase } from '../../helpers/test-db';

class TestEvent extends BaseDomainEvent {
  constructor(public readonly tenantId: string) {
    super('TEST_EVENT');
  }
}

describe('OutboxRepository (Integration)', () => {
  let prisma: PrismaClient;
  let repository: OutboxRepository;

  beforeAll(() => {
    prisma = getTestPrisma();
    repository = new OutboxRepository(prisma);
  });

  beforeEach(async () => {
    await prisma.outboxEvent.deleteMany();
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany();
    await disconnectTestDatabase();
  });

  it('stores an event once even when it is published twice', async () => {
    const event = new TestEvent('tenant-1');

    await repository.enqueue(event);
    await repository.enqueueMany([event]);

    expect(await prisma.outboxEvent.count()).toBe(1);
    const row = await prisma.outboxEvent.findFirstOrThrow();
    expect(row.status).toBe(OutboxStatus.PENDING);
    expect(row.tenantId).toBe('tenant-1');
  });

  it('never gives the same event to two concurrent workers', async () => {
    await repository.enqueueMany(
      Array.from({ length: 20 }, (_, i) => new TestEvent(`tenant-${i}`)),
    );

    const [a, b] = await Promise.all([
      repository.claimBatch('worker-a', 15),
      repository.claimBatch('worker-b', 15),
    ]);

    const idsA = new Set(a.map((r) => r.id));
    const overlap = b.filter((r) => idsA.has(r.id));

    expect(overlap).toHaveLength(0);
    expect(a.length + b.length).toBe(20);
    expect([...a, ...b].every((r) => r.attempts === 1)).toBe(true);
  });

  it('only lets the lease holder complete an event', async () => {
    await repository.enqueue(new TestEvent('tenant-1'));
    const [claimed] = await repository.claimBatch('worker-a', 1);

    await repository.markProcessed(claimed.id, 'worker-b');
    expect(
      (await prisma.outboxEvent.findUniqueOrThrow({ where: { id: claimed.id } })).status,
    ).toBe(OutboxStatus.PROCESSING);

    await repository.markProcessed(claimed.id, 'worker-a');
    const row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: claimed.id } });
    expect(row.status).toBe(OutboxStatus.PROCESSED);
    expect(row.lockedBy).toBeNull();
  });

  it('reclaims events whose lease expired (crashed worker)', async () => {
    await repository.enqueue(new TestEvent('tenant-1'));
    const [claimed] = await repository.claimBatch('worker-a', 1);

    expect(await repository.claimBatch('worker-b', 1, 60_000)).toHaveLength(0);

    await prisma.outboxEvent.update({
      where: { id: claimed.id },
      data: { lockedAt: new Date(Date.now() - 10 * 60 * 1000) },
    });

    const reclaimed = await repository.claimBatch('worker-b', 1, 60_000);
    expect(reclaimed.map((r) => r.id)).toEqual([claimed.id]);
    expect(reclaimed[0].attempts).toBe(2);
  });

  it('schedules failed events for a later retry and dead-letters at max attempts', async () => {
    await repository.enqueue(new TestEvent('tenant-1'));
    const [claimed] = await repository.claimBatch('worker-a', 1);

    await repository.markFailed(claimed, 'worker-a', 'boom');
    let row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: claimed.id } });
    expect(row.status).toBe(OutboxStatus.FAILED);
    expect(row.availableAt.getTime()).toBeGreaterThan(Date.now());
    expect(await repository.claimBatch('worker-a', 1)).toHaveLength(0);

    await prisma.outboxEvent.update({
      where: { id: claimed.id },
      data: { availableAt: new Date(Date.now() - 1000), attempts: 4 },
    });
    const [lastAttempt] = await repository.claimBatch('worker-a', 1);
    expect(lastAttempt.attempts).toBe(5);

    await repository.markFailed(lastAttempt, 'worker-a', 'still broken');
    row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: claimed.id } });
    expect(row.status).toBe(OutboxStatus.DEAD_LETTER);
    expect(row.deadLetterReason).toBe('still broken');
  });
});
