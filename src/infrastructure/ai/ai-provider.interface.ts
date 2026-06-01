export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  messages: AIMessage[];
}

export interface AICompletionResult {
  content: string;
  tokensUsed: number;
  model: string;
  processingMs: number;
}

export interface AICategorizationResult {
  category: string;
  confidence: number;
  reasoning: string;
}

export interface AISentimentResult {
  score: number; // -1 to 1
  label: string; // POSITIVE, NEUTRAL, NEGATIVE, FRUSTRATED
  confidence: number;
}

export interface AIUrgencyResult {
  score: number; // 0 to 100
  recommendedPriority: string;
  reasoning: string;
}

export interface AIResponseSuggestion {
  content: string;
  tone: string;
  reasoning: string;
}

export interface AIResolutionSummary {
  summary: string;
  keyPoints: string[];
  resolutionType: string;
}

export interface AIRiskScore {
  score: number; // 0 to 100
  label: string; // LOW, MEDIUM, HIGH, CRITICAL
  factors: string[];
}

export interface IAIProvider {
  complete(options: AICompletionOptions): Promise<AICompletionResult>;
  categorizeTicket(
    title: string,
    description: string,
  ): Promise<AICategorizationResult>;
  analyzeSentiment(text: string): Promise<AISentimentResult>;
  predictUrgency(
    title: string,
    description: string,
  ): Promise<AIUrgencyResult>;
  suggestResponse(
    ticketContext: string,
    conversationHistory: string,
  ): Promise<AIResponseSuggestion>;
  generateResolutionSummary(
    ticketContext: string,
  ): Promise<AIResolutionSummary>;
  calculateRiskScore(customerContext: string): Promise<AIRiskScore>;
}