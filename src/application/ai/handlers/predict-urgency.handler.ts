import type { PredictUrgencyCommand } from '../commands/predict-urgency.command';
import type { AIService } from '../services/ai.service';

export class PredictUrgencyHandler {
  constructor(private readonly aiService: AIService) {}

  async execute(command: PredictUrgencyCommand): Promise<void> {
    await this.aiService.processUrgencyJob({
      jobType: 'urgency',
      ...command,
    });
  }
}
