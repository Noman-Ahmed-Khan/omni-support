import type { SuggestResponseCommand } from '../commands/suggest-response.command';
import type { AIService } from '../services/ai.service';

export class SuggestResponseHandler {
  constructor(private readonly aiService: AIService) {}

  async execute(command: SuggestResponseCommand): Promise<void> {
    await this.aiService.processSuggestResponseJob({
      jobType: 'suggest-response',
      ...command,
    });
  }
}
