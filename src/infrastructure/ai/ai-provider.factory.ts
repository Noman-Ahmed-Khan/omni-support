import { IAIProvider } from './ai-provider.interface';
import { OpenAIProvider } from './openai.provider';
import { aiConfig } from '../../config/ai.config';

export class AIProviderFactory {
  private static instance: IAIProvider;

  static create(): IAIProvider {
    if (AIProviderFactory.instance) {
      return AIProviderFactory.instance;
    }

    const provider: string = aiConfig.provider;

    switch (provider) {
      case 'openai':
        AIProviderFactory.instance = new OpenAIProvider(aiConfig.openaiApiKey);
        break;
      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }

    return AIProviderFactory.instance;
  }
}
