import type { MetricsService } from './metrics.service';
import type { OutboxRepository } from '../../outbox/outbox.repository';
import { getQueue, QueueName } from '../../queue/queue.factory';

/** Outbox backlog gauges: lag and dead letters show undelivered side effects. */
export function createOutboxGaugeCollector(
  metrics: MetricsService,
  outboxRepository: Pick<OutboxRepository, 'getStats'>,
): () => Promise<void> {
  return async () => {
    const stats = await outboxRepository.getStats();
    metrics.setGauge('outbox_events', stats.pending, { status: 'pending' });
    metrics.setGauge('outbox_events', stats.processing, { status: 'processing' });
    metrics.setGauge('outbox_events', stats.failed, { status: 'failed' });
    metrics.setGauge('outbox_events', stats.deadLetter, { status: 'dead_letter' });
    metrics.setGauge('outbox_oldest_pending_age_seconds', stats.oldestPendingAgeSeconds);
  };
}

/** BullMQ queue depth per state, read from Redis so it covers every worker process. */
export function createQueueGaugeCollector(metrics: MetricsService): () => Promise<void> {
  return async () => {
    for (const name of Object.values(QueueName)) {
      const counts = await getQueue(name).getJobCounts(
        'waiting',
        'active',
        'delayed',
        'failed',
      );
      for (const [state, value] of Object.entries(counts)) {
        metrics.setGauge('queue_jobs', value, { queue: name, state });
      }
    }
  };
}
