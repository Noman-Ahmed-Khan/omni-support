import { CategorizeTicketCommand } from '../commands/categorize-ticket.command';
import { AIService } from '../services/ai.service';

export class CategorizeTicketHandler {
  constructor(private readonly aiService: AIService) {}

  async execute(command: CategorizeTicketCommand): Promise<void> {
    await this.aiService.processCategorizationJob({
      jobType: 'categorize',
      ...command,
    });
  }
}
