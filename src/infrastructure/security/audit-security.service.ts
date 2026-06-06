import { logger } from '../../shared/utils/logger.util';

export class AuditSecurityService {
  record(event: string, details: Record<string, unknown> = {}): void {
    logger.warn('Security audit event', {
      event,
      ...details,
    });
  }
}
