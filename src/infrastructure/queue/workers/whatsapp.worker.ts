import type { Job } from 'bullmq';
import { Worker } from 'bullmq';

import { logger } from '../../../shared/utils/logger.util';
import { getBullMqConnectionOptions, registerWorker, QueueName } from '../queue.factory';
import type { WhatsAppJobData } from '../queues/whatsapp.queue';

export function createWhatsAppWorker(
  sendWhatsApp: (data: WhatsAppJobData) => Promise<void>,
): Worker {
  const worker = new Worker(
    QueueName.WHATSAPP,
    async (job: Job<WhatsAppJobData>) => {
      logger.info('Sending WhatsApp message', {
        jobId: job.id,
        to: job.data.to,
      });

      await sendWhatsApp(job.data);
    },
    {
      connection: getBullMqConnectionOptions(),
      concurrency: 5,
    },
  );

  worker.on('failed', (job, error) => {
    logger.error('WhatsApp job failed', {
      jobId: job?.id,
      to: job?.data?.to,
      error: error.message,
    });
  });

  return registerWorker(worker);
}
