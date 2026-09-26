import {
  InProcessEventBus,
  type HandlerLedger,
} from '../../../../src/application/event-bus/event-bus';
import { BaseDomainEvent } from '../../../../src/domain/shared/base.event';

class TestEvent extends BaseDomainEvent {
  constructor() {
    super('TEST_EVENT');
  }
}

class MemoryLedger implements HandlerLedger {
  readonly done = new Set<string>();
  isDone(key: string) {
    return Promise.resolve(this.done.has(key));
  }
  markDone(key: string) {
    this.done.add(key);
    return Promise.resolve();
  }
}

describe('InProcessEventBus', () => {
  it('rejects when a handler fails so the outbox retries the event', async () => {
    const bus = new InProcessEventBus();
    bus.subscribe('TEST_EVENT', () => Promise.reject(new Error('smtp down')));

    await expect(bus.publish(new TestEvent())).rejects.toThrow(AggregateError);
  });

  it('does not re-run handlers that already succeeded when the event is retried', async () => {
    const bus = new InProcessEventBus(new MemoryLedger());
    const sendEmail = jest.fn().mockResolvedValue(undefined);
    const pushWebsocket = jest
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValue(undefined);
    bus.subscribe('TEST_EVENT', sendEmail);
    bus.subscribe('TEST_EVENT', pushWebsocket);

    const event = new TestEvent();
    await expect(bus.publish(event)).rejects.toThrow();
    await bus.publish(event);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(pushWebsocket).toHaveBeenCalledTimes(2);
  });
});
