import { z } from 'zod';

const aiConfigSchema = z.object({
  provider: z.enum(['openai']).default('openai'),
  openaiApiKey: z.string().min(1),
  escalationUrgencyThreshold: z.coerce.number().default(75),
  riskScoreHighThreshold: z.coerce.number().default(70),
  riskScoreCriticalThreshold: z.coerce.number().default(85),
});

export type AIConfig = z.infer<typeof aiConfigSchema>;

let _aiConfig: AIConfig | null = null;

/**
 * Returns the validated AI/OpenAI configuration.
 * Config is parsed lazily on first access so that importing this module
 * does NOT trigger environment variable validation at module load time.
 * This keeps unit tests free of infrastructure coupling.
 */
export function getAIConfig(): AIConfig {
  if (!_aiConfig) {
    _aiConfig = aiConfigSchema.parse({
      provider: process.env.AI_PROVIDER ?? 'openai',
      openaiApiKey: process.env.OPENAI_API_KEY,
      escalationUrgencyThreshold: process.env.AI_ESCALATION_THRESHOLD,
      riskScoreHighThreshold: process.env.AI_RISK_HIGH_THRESHOLD,
      riskScoreCriticalThreshold: process.env.AI_RISK_CRITICAL_THRESHOLD,
    });
  }
  return _aiConfig;
}

/** @internal For testing — resets the singleton so tests can override env vars. */
export function _resetAIConfig(): void {
  _aiConfig = null;
}
