import type { Job } from 'bullmq';
import { Worker } from 'bullmq';

import { logger } from '../../../shared/utils/logger.util';
import { getBullMqConnectionOptions, registerWorker, QueueName } from '../queue.factory';
import type { EmailJobData } from '../queues/email.queue';

export function createEmailWorker(
  sendEmail: (data: EmailJobData) => Promise<void>,
): Worker {
  const worker = new Worker(
    QueueName.EMAIL,
    async (job: Job<EmailJobData>) => {
      logger.info('Sending email', {
        jobId: job.id,
        to: job.data.to,
        subject: job.data.subject,
      });

      await sendEmail(job.data);
    },
    {
      connection: getBullMqConnectionOptions(),
      concurrency: 10,
    },
  );

  worker.on('failed', (job, error) => {
    logger.error('Email job failed', {
      jobId: job?.id,
      to: job?.data?.to,
      error: error.message,
    });
  });

  return registerWorker(worker);
}
