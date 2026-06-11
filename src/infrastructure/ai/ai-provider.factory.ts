import type { IAIProvider } from './ai-provider.interface';
import { OpenAIProvider } from './openai.provider';
import { getAIConfig } from '../../config/ai.config';

export class AIProviderFactory {
  private static instance: IAIProvider;

  static create(): IAIProvider {
    if (AIProviderFactory.instance) {
      return AIProviderFactory.instance;
    }

    const config = getAIConfig();
    const provider: string = config.provider;

    switch (provider) {
      case 'openai':
        AIProviderFactory.instance = new OpenAIProvider(config.openaiApiKey);
        break;
      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }

    return AIProviderFactory.instance;
  }
}
