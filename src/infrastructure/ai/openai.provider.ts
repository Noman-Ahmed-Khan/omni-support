import OpenAI from 'openai';
import { z } from 'zod';
import {
  IAIProvider,
  AICompletionOptions,
  AICompletionResult,
  AICategorizationResult,
  AISentimentResult,
  AIUrgencyResult,
  AIResponseSuggestion,
  AIResolutionSummary,
  AIRiskScore,
} from './ai-provider.interface';
import { logger } from '../../shared/utils/logger.util';
import { InfrastructureError } from '../../shared/errors/infrastructure.error';

export class OpenAIProvider implements IAIProvider {
  private readonly client: OpenAI;
  private readonly defaultModel = 'gpt-4o-mini';

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  private parseJson<T>(content: string, schema: z.ZodType<T>): T | null {
    try {
      const parsed: unknown = JSON.parse(content);
      const result = schema.safeParse(parsed);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    const startTime = Date.now();

    try {
      const response = await this.client.chat.completions.create({
        model: options.model ?? this.defaultModel,
        messages: options.messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 1000,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content ?? '';
      const tokensUsed = response.usage?.total_tokens ?? 0;
      const processingMs = Date.now() - startTime;

      return {
        content,
        tokensUsed,
        model: response.model,
        processingMs,
      };
    } catch (error) {
      logger.error('OpenAI completion failed', { error });
      throw new InfrastructureError('AI completion failed', { error });
    }
  }

  async categorizeTicket(
    title: string,
    description: string,
  ): Promise<AICategorizationResult> {
    const result = await this.complete({
      messages: [
        {
          role: 'system',
          content: `You are a customer support ticket categorization system.
Categorize tickets into ONE of these categories:
BILLING, TECHNICAL, ACCOUNT, REFUND, SHIPPING, GENERAL, OTHER.
Always respond with valid JSON matching this exact schema:
{"category": string, "confidence": number (0-1), "reasoning": string}`,
        },
        {
          role: 'user',
          content: `Categorize this ticket:
Title: ${title}
Description: ${description}`,
        },
      ],
      temperature: 0.1,
      maxTokens: 200,
    });

    const schema = z.object({
      category: z.string().optional(),
      confidence: z.number().optional(),
      reasoning: z.string().optional(),
    });

    const parsed = this.parseJson(result.content, schema);
    if (!parsed) {
      return { category: 'GENERAL', confidence: 0.5, reasoning: 'Parse error' };
    }

    return {
      category: parsed.category ?? 'GENERAL',
      confidence: parsed.confidence ?? 0.5,
      reasoning: parsed.reasoning ?? '',
    };
  }

  async analyzeSentiment(text: string): Promise<AISentimentResult> {
    const result = await this.complete({
      messages: [
        {
          role: 'system',
          content: `You are a sentiment analysis system for customer support.
Analyze the sentiment of customer messages.
Labels must be one of: POSITIVE, NEUTRAL, NEGATIVE, FRUSTRATED.
FRUSTRATED means angry or very dissatisfied customer.
Respond with valid JSON: {"score": number (-1 to 1), "label": string, "confidence": number (0-1)}`,
        },
        {
          role: 'user',
          content: `Analyze sentiment: "${text}"`,
        },
      ],
      temperature: 0.1,
      maxTokens: 150,
    });

    const schema = z.object({
      score: z.number().optional(),
      label: z.string().optional(),
      confidence: z.number().optional(),
    });

    const parsed = this.parseJson(result.content, schema);
    if (!parsed) {
      return { score: 0, label: 'NEUTRAL', confidence: 0.5 };
    }

    return {
      score: parsed.score ?? 0,
      label: parsed.label ?? 'NEUTRAL',
      confidence: parsed.confidence ?? 0.5,
    };
  }

  async predictUrgency(
    title: string,
    description: string,
  ): Promise<AIUrgencyResult> {
    const result = await this.complete({
      messages: [
        {
          role: 'system',
          content: `You are an urgency prediction system for customer support tickets.
Predict the urgency score (0-100) and recommended priority.
Priority must be one of: LOW, MEDIUM, HIGH, CRITICAL.
Consider: business impact, customer frustration, time sensitivity, financial implications.
Respond with valid JSON: {"score": number (0-100), "recommendedPriority": string, "reasoning": string}`,
        },
        {
          role: 'user',
          content: `Predict urgency for:
Title: ${title}
Description: ${description}`,
        },
      ],
      temperature: 0.1,
      maxTokens: 200,
    });

    const schema = z.object({
      score: z.number().optional(),
      recommendedPriority: z.string().optional(),
      reasoning: z.string().optional(),
    });

    const parsed = this.parseJson(result.content, schema);
    if (!parsed) {
      return { score: 50, recommendedPriority: 'MEDIUM', reasoning: '' };
    }

    return {
      score: parsed.score ?? 50,
      recommendedPriority: parsed.recommendedPriority ?? 'MEDIUM',
      reasoning: parsed.reasoning ?? '',
    };
  }

  async suggestResponse(
    ticketContext: string,
    conversationHistory: string,
  ): Promise<AIResponseSuggestion> {
    const result = await this.complete({
      messages: [
        {
          role: 'system',
          content: `You are a helpful customer support assistant.
Generate professional, empathetic response suggestions for support agents.
Keep responses concise, helpful, and action-oriented.
Respond with valid JSON: {"content": string, "tone": string, "reasoning": string}`,
        },
        {
          role: 'user',
          content: `Ticket Context: ${ticketContext}

Conversation History: ${conversationHistory}

Generate a suggested response:`,
        },
      ],
      temperature: 0.7,
      maxTokens: 500,
    });

    const schema = z.object({
      content: z.string().optional(),
      tone: z.string().optional(),
      reasoning: z.string().optional(),
    });

    const parsed = this.parseJson(result.content, schema);
    if (!parsed) {
      return { content: '', tone: 'professional', reasoning: '' };
    }

    return {
      content: parsed.content ?? '',
      tone: parsed.tone ?? 'professional',
      reasoning: parsed.reasoning ?? '',
    };
  }

  async generateResolutionSummary(
    ticketContext: string,
  ): Promise<AIResolutionSummary> {
    const result = await this.complete({
      messages: [
        {
          role: 'system',
          content: `You are a ticket resolution summarization system.
Generate concise summaries of resolved support tickets for knowledge base and reporting.
Respond with valid JSON: {"summary": string, "keyPoints": string[], "resolutionType": string}
resolutionType must be one of: FIXED, WORKAROUND, INFORMATION_PROVIDED, ESCALATED, REFUNDED, OTHER`,
        },
        {
          role: 'user',
          content: `Summarize this resolved ticket: ${ticketContext}`,
        },
      ],
      temperature: 0.3,
      maxTokens: 400,
    });

    const schema = z.object({
      summary: z.string().optional(),
      keyPoints: z.array(z.string()).optional(),
      resolutionType: z.string().optional(),
    });

    const parsed = this.parseJson(result.content, schema);
    if (!parsed) {
      return { summary: '', keyPoints: [], resolutionType: 'OTHER' };
    }

    return {
      summary: parsed.summary ?? '',
      keyPoints: parsed.keyPoints ?? [],
      resolutionType: parsed.resolutionType ?? 'OTHER',
    };
  }

  async calculateRiskScore(
    customerContext: string,
  ): Promise<AIRiskScore> {
    const result = await this.complete({
      messages: [
        {
          role: 'system',
          content: `You are a customer risk scoring system.
Calculate a risk score (0-100) based on customer behavior patterns.
Consider: ticket frequency, unresolved issues, sentiment trends, response patterns.
Label must be one of: LOW (0-25), MEDIUM (26-50), HIGH (51-75), CRITICAL (76-100).
Respond with valid JSON: {"score": number, "label": string, "factors": string[]}`,
        },
        {
          role: 'user',
          content: `Calculate risk score for customer: ${customerContext}`,
        },
      ],
      temperature: 0.1,
      maxTokens: 300,
    });

    const schema = z.object({
      score: z.number().optional(),
      label: z.string().optional(),
      factors: z.array(z.string()).optional(),
    });

    const parsed = this.parseJson(result.content, schema);
    if (!parsed) {
      return { score: 0, label: 'LOW', factors: [] };
    }

    return {
      score: parsed.score ?? 0,
      label: parsed.label ?? 'LOW',
      factors: parsed.factors ?? [],
    };
  }
}