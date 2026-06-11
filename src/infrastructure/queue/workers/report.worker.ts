import type { Job } from 'bullmq';
import { Worker } from 'bullmq';

import { logger } from '../../../shared/utils/logger.util';
import { getBullMqConnectionOptions, registerWorker, QueueName } from '../queue.factory';
import type { ReportJobData } from '../queues/report.queue';

export function createReportWorker(
  handler: (data: ReportJobData) => Promise<void>,
): Worker {
  const worker = new Worker(
    QueueName.REPORTS,
    async (job: Job<ReportJobData>) => {
      logger.info('Processing report job', {
        jobId: job.id,
        jobType: job.data.jobType,
        tenantId: job.data.tenantId,
      });

      await handler(job.data);
    },
    {
      connection: getBullMqConnectionOptions(),
      concurrency: 2,
    },
  );

  worker.on('failed', (job, error) => {
    logger.error('Report job failed', {
      jobId: job?.id,
      jobType: job?.data?.jobType,
      error: error.message,
    });
  });

  return registerWorker(worker);
}
