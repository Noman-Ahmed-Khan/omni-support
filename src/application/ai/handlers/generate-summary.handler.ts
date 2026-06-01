import { GenerateSummaryCommand } from '../commands/generate-summary.command';
import { AIService } from '../services/ai.service';

export class GenerateSummaryHandler {
  constructor(private readonly aiService: AIService) {}

  async execute(command: GenerateSummaryCommand): Promise<void> {
    await this.aiService.processSummarizeJob({
      jobType: 'summarize',
      ...command,
    });
  }
}
