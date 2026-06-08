import type { AnalyzeSentimentCommand } from '../commands/analyze-sentiment.command';
import type { AIService } from '../services/ai.service';

export class AnalyzeSentimentHandler {
  constructor(private readonly aiService: AIService) {}

  async execute(command: AnalyzeSentimentCommand): Promise<void> {
    await this.aiService.processSentimentJob({
      jobType: 'sentiment',
      ...command,
    });
  }
}
