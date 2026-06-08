import { ReportController } from '../../../presentation/http/controllers/report.controller';
import { ReportQueue } from '../../queue/queues/report.queue';
import type { Container } from '../index';

export function registerReportModule(container: Container): void {
  const reportQueue = new ReportQueue();
  container.register('reportQueue', reportQueue);

  const reportController = new ReportController(reportQueue);
  container.register('reportController', reportController);
}
