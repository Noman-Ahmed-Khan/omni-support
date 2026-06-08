import type {
  AuditRepository,
  AuditLogEntry,
} from '../../../infrastructure/database/repositories/audit.repository';

export class AuditService {
  constructor(private readonly auditRepository: AuditRepository) {}

  async logAction(entry: AuditLogEntry): Promise<void> {
    await this.auditRepository.create(entry);
  }

  async getTenantLogs(tenantId: string, page: number = 1, limit: number = 50) {
    return this.auditRepository.findByTenant(tenantId, page, limit);
  }

  async getResourceLogs(resource: string, resourceId: string, tenantId?: string) {
    return this.auditRepository.findByResource(resource, resourceId, tenantId);
  }
}
