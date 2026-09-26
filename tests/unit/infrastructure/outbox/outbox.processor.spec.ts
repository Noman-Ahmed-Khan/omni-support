import type { MockProxy } from 'jest-mock-extended';
import { mockDeep } from 'jest-mock-extended';

import { OutboxStatus } from '../../../../src/infrastructure/outbox/outbox.entity';
import type { OutboxRecord } from '../../../../src/infrastructure/outbox/outbox.entity';
import {
  OutboxProcessor,
  type OutboxEventDispatcher,
} from '../../../../src/infrastructure/outbox/outbox.processor';
import type { OutboxRepository } from '../../../../src/infrastructure/outbox/outbox.repository';
import { computeRetryDelayMs } from '../../../../src/infrastructure/outbox/outbox.repository';
import { OutboxWorker } from '../../../../src/infrastructure/outbox/outbox.worker';

function record(overrides: Partial<OutboxRecord> = {}): OutboxRecord {
  return {
    id: 'outbox-1',
    eventId: 'event-1',
    eventType: 'TICKET_CREATED',
    occurredAt: new Date('2026-01-01T00:00:00Z'),
    payload: { ticketId: 'ticket-1', tenantId: 'tenant-1' },
    status: OutboxStatus.PROCESSING,
    attempts: 1,
    maxAttempts: 5,
    availableAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('OutboxProcessor', () => {
  let repository: MockProxy<OutboxRepository>;
  let dispatcher: MockProxy<OutboxEventDispatcher>;
  let processor: OutboxProcessor;

  beforeEach(() => {
    repository = mockDeep<OutboxRepository>();
    dispatcher = mockDeep<OutboxEventDispatcher>();
    processor = new OutboxProcessor(repository, dispatcher, { workerId: 'worker-a' });
  });

  it('claims with its worker id and marks delivered events processed', async () => {
    repository.claimBatch.mockResolvedValue([record()]);
    dispatcher.publish.mockResolvedValue(undefined);

    const processed = await processor.processBatch(10);

    expect(processed).toBe(1);
    expect(repository.claimBatch).toHaveBeenCalledWith(
      'worker-a',
      10,
      expect.any(Number),
    );
    expect(dispatcher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'event-1',
        eventType: 'TICKET_CREATED',
        ticketId: 'ticket-1',
      }),
    );
    expect(repository.markProcessed).toHaveBeenCalledWith('outbox-1', 'worker-a');
    expect(repository.markFailed).not.toHaveBeenCalled();
  });

  it('marks the event failed when a handler rejects, and continues with the batch', async () => {
    const failing = record({ id: 'outbox-1' });
    const ok = record({ id: 'outbox-2', eventId: 'event-2' });
    repository.claimBatch.mockResolvedValue([failing, ok]);
    dispatcher.publish
      .mockRejectedValueOnce(new Error('smtp down'))
      .mockResolvedValueOnce(undefined);

    const processed = await processor.processBatch();

    expect(processed).toBe(1);
    expect(repository.markFailed).toHaveBeenCalledWith(failing, 'worker-a', 'smtp down');
    expect(repository.markProcessed).toHaveBeenCalledWith('outbox-2', 'worker-a');
  });
});

describe('computeRetryDelayMs', () => {
  it('backs off exponentially and is capped at one hour', () => {
    expect(computeRetryDelayMs(1)).toBe(5_000);
    expect(computeRetryDelayMs(2)).toBe(10_000);
    expect(computeRetryDelayMs(3)).toBe(20_000);
    expect(computeRetryDelayMs(30)).toBe(60 * 60 * 1000);
  });
});

describe('OutboxWorker', () => {
  it('never runs overlapping batches and waits for the running batch on stop', async () => {
    const processor = mockDeep<OutboxProcessor>();
    let release!: () => void;
    processor.processBatch.mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          release = () => resolve(0);
        }),
    );

    const worker = new OutboxWorker(processor, 60_000);
    worker.start();

    const first = worker.tick();
    await worker.tick(); // skipped while the first batch is in flight
    expect(processor.processBatch).toHaveBeenCalledTimes(1);

    const stopped = worker.stop();
    release();
    await Promise.all([first, stopped]);
  });
});
