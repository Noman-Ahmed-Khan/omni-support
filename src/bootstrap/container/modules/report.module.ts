import type { Container } from '..';
import { ReportController } from '../../../presentation/http/controllers/report.controller';

export function registerReportModule(container: Container): void {
  container.register('reportController', new ReportController());
}
