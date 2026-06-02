import { AIResult, PrismaClient, Prisma } from '@prisma/client';
import { IAIProvider } from '../../../infrastructure/ai/ai-provider.interface';
import { ITicketRepository } from '../../../domain/ticket/repositories/ticket.repository.interface';
import { CustomerService } from '../../customer/services/customer.service';
import { TicketService } from '../../ticket/services/ticket.service';
import { ActivityRepository } from '../../../infrastructure/database/repositories/activity.repository';
import { WebSocketGateway } from '../../../infrastructure/realtime/websocket.gateway';
import { aiConfig } from '../../../config/ai.config';
import { logger } from '../../../shared/utils/logger.util';
import crypto from 'crypto';

export interface AIJobData {
  jobType: string;
  tenantId: string;
  ticketId?: string;
  customerId?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export class AIService {
  constructor(
    private readonly aiProvider: IAIProvider,
    private readonly prisma: PrismaClient,
    private readonly ticketRepo: ITicketRepository,
    private readonly customerService: CustomerService,
    private readonly ticketService: TicketService,
    private readonly activityRepo: ActivityRepository,
    private readonly wsGateway: WebSocketGateway,
  ) {}

  async processCategorizationJob(data: AIJobData): Promise<void> {
    if (!data.ticketId) return;

    try {
      const ticket = await this.ticketRepo.findById(data.ticketId, data.tenantId);
      if (!ticket) return;

      const startTime = Date.now();
      const result = await this.aiProvider.categorizeTicket(
        ticket.title,
        ticket.description,
      );

      // Save AI result
      await this.prisma.aIResult.create({
        data: {
          id: crypto.randomUUID(),
          tenantId: data.tenantId,
          ticketId: data.ticketId,
          type: 'CATEGORIZATION',
          provider: 'openai',
          model: 'gpt-4o-mini',
          result: toInputJson(result),
          confidence: result.confidence,
          processingMs: Date.now() - startTime,
        },
      });

      // Update ticket category if confidence is high
      if (result.confidence >= 0.7) {
        ticket.updateCategory(result.category);
        await this.ticketRepo.update(ticket);

        await this.activityRepo.create({
          tenantId: data.tenantId,
          ticketId: data.ticketId,
          eventType: 'AI_CATEGORIZED',
          description: `AI categorized ticket as ${result.category} (confidence: ${(result.confidence * 100).toFixed(0)}%)`,
          newValue: { category: result.category, confidence: result.confidence },
        });
      }

      // Send realtime update
      this.wsGateway.sendToTicket(data.ticketId, {
        event: 'ai:categorized',
        data: {
          ticketId: data.ticketId,
          category: result.category,
          confidence: result.confidence,
        },
      });

      logger.info('AI categorization complete', {
        ticketId: data.ticketId,
        category: result.category,
        confidence: result.confidence,
      });
    } catch (error) {
      logger.error('AI categorization failed', { ticketId: data.ticketId, error });
    }
  }

  async processSentimentJob(data: AIJobData): Promise<void> {
    if (!data.ticketId) return;

    try {
      const startTime = Date.now();
      const result = await this.aiProvider.analyzeSentiment(data.content);

      await this.prisma.aIResult.create({
        data: {
          id: crypto.randomUUID(),
          tenantId: data.tenantId,
          ticketId: data.ticketId,
          type: 'SENTIMENT',
          provider: 'openai',
          model: 'gpt-4o-mini',
          result: toInputJson(result),
          confidence: result.confidence,
          processingMs: Date.now() - startTime,
        },
      });

      this.wsGateway.sendToTicket(data.ticketId, {
        event: 'ai:sentiment',
        data: { ticketId: data.ticketId, sentiment: result },
      });

      // Auto-escalate if sentiment is very negative / frustrated
      if (result.label === 'FRUSTRATED' && result.confidence >= 0.8) {
        const ticket = await this.ticketRepo.findById(data.ticketId, data.tenantId);

        if (ticket && !ticket.isEscalated && ticket.isActive()) {
          await this.ticketService.escalateTicket({
            tenantId: data.tenantId,
            ticketId: data.ticketId,
            reason: `AI detected frustrated customer (sentiment score: ${result.score.toFixed(2)})`,
            escalatedById: 'system',
            escalatedByRole: 'SYSTEM',
          });
        }
      }

      logger.info('AI sentiment analysis complete', {
        ticketId: data.ticketId,
        label: result.label,
        score: result.score,
      });
    } catch (error) {
      logger.error('AI sentiment analysis failed', { ticketId: data.ticketId, error });
    }
  }

  async processUrgencyJob(data: AIJobData): Promise<void> {
    if (!data.ticketId) return;

    try {
      const ticket = await this.ticketRepo.findById(data.ticketId, data.tenantId);
      if (!ticket) return;

      const startTime = Date.now();
      const result = await this.aiProvider.predictUrgency(
        ticket.title,
        ticket.description,
      );

      await this.prisma.aIResult.create({
        data: {
          id: crypto.randomUUID(),
          tenantId: data.tenantId,
          ticketId: data.ticketId,
          type: 'URGENCY',
          provider: 'openai',
          model: 'gpt-4o-mini',
          result: toInputJson(result),
          confidence: result.score / 100,
          processingMs: Date.now() - startTime,
        },
      });

      // Auto-escalate if urgency exceeds threshold
      if (
        result.score >= aiConfig.escalationUrgencyThreshold &&
        !ticket.isEscalated &&
        ticket.isActive()
      ) {
        await this.ticketService.escalateTicket({
          tenantId: data.tenantId,
          ticketId: data.ticketId,
          reason: `AI predicted high urgency score: ${result.score}/100. ${result.reasoning}`,
          escalatedById: 'system',
          escalatedByRole: 'SYSTEM',
        });

        await this.activityRepo.create({
          tenantId: data.tenantId,
          ticketId: data.ticketId,
          eventType: 'AI_ESCALATED',
          description: `AI auto-escalated ticket due to urgency score: ${result.score}`,
          newValue: { urgencyScore: result.score, reasoning: result.reasoning },
        });
      }

      this.wsGateway.sendToTicket(data.ticketId, {
        event: 'ai:urgency',
        data: { ticketId: data.ticketId, urgency: result },
      });

      logger.info('AI urgency prediction complete', {
        ticketId: data.ticketId,
        score: result.score,
        recommendedPriority: result.recommendedPriority,
      });
    } catch (error) {
      logger.error('AI urgency prediction failed', { ticketId: data.ticketId, error });
    }
  }

  async processSuggestResponseJob(data: AIJobData): Promise<void> {
    if (!data.ticketId) return;

    try {
      const ticket = await this.ticketRepo.findById(data.ticketId, data.tenantId);
      if (!ticket) return;

      // Get recent comments for context
      const recentComments = await this.prisma.ticketComment.findMany({
        where: { ticketId: data.ticketId, type: 'PUBLIC' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { author: { select: { firstName: true, role: true } } },
      });

      const conversationHistory = recentComments
        .reverse()
        .map((c) => `${c.author.firstName} (${c.author.role}): ${c.content}`)
        .join('\n\n');

      const ticketContext = `Title: ${ticket.title}\nDescription: ${ticket.description}\nStatus: ${ticket.status}\nCategory: ${ticket.category}`;

      const startTime = Date.now();
      const result = await this.aiProvider.suggestResponse(
        ticketContext,
        conversationHistory,
      );

      const aiResult = await this.prisma.aIResult.create({
        data: {
          id: crypto.randomUUID(),
          tenantId: data.tenantId,
          ticketId: data.ticketId,
          type: 'RESPONSE_SUGGESTION',
          provider: 'openai',
          model: 'gpt-4o-mini',
          result: toInputJson(result),
          processingMs: Date.now() - startTime,
          wasAccepted: false,
        },
      });

      // Send suggestion to the assigned agent via WebSocket
      if (ticket.assignedAgentId) {
        this.wsGateway.sendToUser(ticket.assignedAgentId, {
          event: 'ai:response-suggestion',
          data: {
            ticketId: data.ticketId,
            suggestionId: aiResult.id,
            suggestion: result,
          },
        });
      }

      logger.info('AI response suggestion generated', {
        ticketId: data.ticketId,
        suggestionId: aiResult.id,
      });
    } catch (error) {
      logger.error('AI response suggestion failed', { ticketId: data.ticketId, error });
    }
  }

  async processSummarizeJob(data: AIJobData): Promise<void> {
    if (!data.ticketId) return;

    try {
      const ticket = await this.ticketRepo.findById(data.ticketId, data.tenantId);
      if (!ticket) return;

      // Build full ticket context
      const comments = await this.prisma.ticketComment.findMany({
        where: { ticketId: data.ticketId, type: 'PUBLIC' },
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { firstName: true, role: true } } },
      });

      const commentsText = comments
        .map((c) => `${c.author.firstName}: ${c.content}`)
        .join('\n\n');

      const fullContext = `
Ticket: ${ticket.title}
Description: ${ticket.description}
Category: ${ticket.category}
Priority: ${ticket.priority}
Conversation:
${commentsText}
      `;

      const startTime = Date.now();
      const result = await this.aiProvider.generateResolutionSummary(fullContext);

      await this.prisma.aIResult.create({
        data: {
          id: crypto.randomUUID(),
          tenantId: data.tenantId,
          ticketId: data.ticketId,
          type: 'RESOLUTION_SUMMARY',
          provider: 'openai',
          model: 'gpt-4o-mini',
          result: toInputJson(result),
          processingMs: Date.now() - startTime,
        },
      });

      await this.activityRepo.create({
        tenantId: data.tenantId,
        ticketId: data.ticketId,
        eventType: 'AI_SUMMARY_GENERATED',
        description: 'AI generated resolution summary',
        newValue: { resolutionType: result.resolutionType },
      });

      logger.info('AI resolution summary generated', {
        ticketId: data.ticketId,
        resolutionType: result.resolutionType,
      });
    } catch (error) {
      logger.error('AI summary generation failed', { ticketId: data.ticketId, error });
    }
  }

  async processRiskScoreJob(data: AIJobData): Promise<void> {
    if (!data.customerId) return;

    try {
      // Build customer context from DB
      const customerData = await this.prisma.customer.findFirst({
        where: { id: data.customerId, tenantId: data.tenantId },
        include: {
          tickets: {
            select: {
              status: true,
              priority: true,
              isEscalated: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
        },
      });

      if (!customerData) return;

      // Get recent sentiment scores
      const recentSentiments = await this.prisma.aIResult.findMany({
        where: {
          customerId: data.customerId,
          type: 'SENTIMENT',
          tenantId: data.tenantId,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      const unresolvedCount = customerData.tickets.filter(
        (t) => !['RESOLVED', 'CLOSED'].includes(t.status),
      ).length;

      const escalatedCount = customerData.tickets.filter((t) => t.isEscalated).length;

      const avgSentiment =
        recentSentiments.length > 0
          ? recentSentiments.reduce((sum, s) => {
              const sentiment = s.result as Prisma.JsonObject | null | undefined;
              return sum + ((sentiment?.score as number) ?? 0);
            }, 0) / recentSentiments.length
          : 0;

      const customerContext = JSON.stringify({
        totalTickets: customerData.tickets.length,
        unresolvedTickets: unresolvedCount,
        escalatedTickets: escalatedCount,
        avgSentimentScore: avgSentiment,
        recentTicketPriorities: customerData.tickets.slice(0, 5).map((t) => t.priority),
      });

      const startTime = Date.now();
      const result = await this.aiProvider.calculateRiskScore(customerContext);

      await this.prisma.aIResult.create({
        data: {
          id: crypto.randomUUID(),
          tenantId: data.tenantId,
          customerId: data.customerId,
          type: 'RISK_SCORE',
          provider: 'openai',
          model: 'gpt-4o-mini',
          result: toInputJson(result),
          confidence: result.score / 100,
          processingMs: Date.now() - startTime,
        },
      });

      // Update customer risk score
      await this.customerService.updateRiskScore(
        data.customerId,
        data.tenantId,
        result.score,
        result.label,
      );

      logger.info('Customer risk score updated', {
        customerId: data.customerId,
        score: result.score,
        label: result.label,
      });
    } catch (error) {
      logger.error('Risk score calculation failed', {
        customerId: data.customerId,
        error,
      });
    }
  }

  async acceptResponseSuggestion(
    suggestionId: string,
    tenantId: string,
    acceptedById: string,
  ): Promise<void> {
    await this.prisma.aIResult.updateMany({
      where: { id: suggestionId, tenantId },
      data: {
        wasAccepted: true,
        acceptedAt: new Date(),
        acceptedById,
      },
    });
  }

  async getTicketAIResults(ticketId: string, tenantId: string): Promise<AIResult[]> {
    return this.prisma.aIResult.findMany({
      where: { ticketId, tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
