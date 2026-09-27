import type { Container } from '..';
import { ReportService } from '../../../application/report/services/report.service';
import { ReportController } from '../../../presentation/http/controllers/report.controller';

export function registerReportModule(container: Container): void {
  const service = new ReportService(
    container.resolve('prisma'),
    container.resolve('storageProvider'),
    container.resolve('auditRepo'),
    container.resolve('permissionService'),
  );
  container.register('reportService', service);
  container.register('reportController', new ReportController(service));
}
