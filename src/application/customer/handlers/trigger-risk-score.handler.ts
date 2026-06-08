import type { CustomerService } from '../services/customer.service';

export interface TriggerRiskScoreCommand {
  customerId: string;
  tenantId: string;
}

export class TriggerRiskScoreHandler {
  constructor(private readonly customerService: CustomerService) {}

  async execute(command: TriggerRiskScoreCommand): Promise<void> {
    await this.customerService.triggerRiskScoreUpdate(
      command.customerId,
      command.tenantId,
    );
  }
}
