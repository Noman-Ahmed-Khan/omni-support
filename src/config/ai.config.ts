import { z } from 'zod';

const aiConfigSchema = z.object({
  provider: z.enum(['openai']).default('openai'),
  openaiApiKey: z.string().min(1),
  escalationUrgencyThreshold: z.coerce.number().default(75),
  riskScoreHighThreshold: z.coerce.number().default(70),
  riskScoreCriticalThreshold: z.coerce.number().default(85),
});

export const aiConfig = aiConfigSchema.parse({
  provider: process.env.AI_PROVIDER ?? 'openai',
  openaiApiKey: process.env.OPENAI_API_KEY,
  escalationUrgencyThreshold: process.env.AI_ESCALATION_THRESHOLD,
  riskScoreHighThreshold: process.env.AI_RISK_HIGH_THRESHOLD,
  riskScoreCriticalThreshold: process.env.AI_RISK_CRITICAL_THRESHOLD,
});
