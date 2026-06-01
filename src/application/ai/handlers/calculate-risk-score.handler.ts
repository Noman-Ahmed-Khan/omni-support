import { CalculateRiskScoreCommand } from '../commands/calculate-risk-score.command';
import { AIService } from '../services/ai.service';

export class CalculateRiskScoreHandler {
  constructor(private readonly aiService: AIService) {}

  async execute(command: CalculateRiskScoreCommand): Promise<void> {
    await this.aiService.processRiskScoreJob({
      jobType: 'risk-score',
      ...command,
    });
  }
}
