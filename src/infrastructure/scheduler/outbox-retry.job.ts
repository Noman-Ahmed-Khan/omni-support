import { OutboxProcessor } from '../outbox/outbox.processor';

export function createOutboxRetryJob(
  outboxProcessor: OutboxProcessor,
): () => Promise<void> {
  return async () => {
    await outboxProcessor.processBatch(100);
  };
}
