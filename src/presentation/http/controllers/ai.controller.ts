import type { Request, Response, NextFunction } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';

import type { AIService } from '../../../application/ai/services/ai.service';
import type { CustomerService } from '../../../application/customer/services/customer.service';
import type {
  TicketAccessService,
  TicketActor,
} from '../../../application/ticket/services/ticket-access.service';
import type { AIJobType, AIQueue } from '../../../infrastructure/queue/queues/ai.queue';
import { NotFoundError } from '../../../shared/errors/domain.error';
import { successResponse } from '../dtos/common/response.dto';

export type AIRequestBody = {
  content?: string;
};

type AIRequest = Request<ParamsDictionary, unknown, AIRequestBody, unknown>;

/** Upper bound on text sent to the AI provider per job. */
const MAX_AI_CONTENT_LENGTH = 10_000;

/**
 * AI analysis is never run inside the request: jobs are queued and processed by the
 * AI worker, so a slow or expensive provider call cannot tie up the API.
 */
export class AIController {
  constructor(
    private readonly aiService: AIService,
    private readonly aiQueue: AIQueue,
    private readonly ticketAccess: TicketAccessService,
    private readonly customerService: CustomerService,
  ) {}

  triggerCategorization(req: AIRequest, res: Response, next: NextFunction) {
    return this.queueTicketJob('categorize', 'Categorization job queued', req, res, next);
  }

  triggerSentiment(req: AIRequest, res: Response, next: NextFunction) {
    return this.queueTicketJob('sentiment', 'Sentiment job queued', req, res, next);
  }

  triggerUrgency(req: AIRequest, res: Response, next: NextFunction) {
    return this.queueTicketJob(
      'urgency',
      'Urgency prediction job queued',
      req,
      res,
      next,
    );
  }

  triggerSuggestResponse(req: AIRequest, res: Response, next: NextFunction) {
    return this.queueTicketJob(
      'suggest-response',
      'Suggest response job queued',
      req,
      res,
      next,
    );
  }

  triggerSummary(req: AIRequest, res: Response, next: NextFunction) {
    return this.queueTicketJob(
      'summarize',
      'Summary generation job queued',
      req,
      res,
      next,
    );
  }

  async triggerRiskScore(
    req: AIRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      // Queues the job only when the customer belongs to the caller's organization.
      await this.customerService.triggerRiskScoreUpdate(req.params.id, req.tenantId!);
      res.status(202).json(successResponse({ message: 'Risk score job queued' }));
    } catch (error) {
      next(error);
    }
  }

  async getTicketResults(
    req: AIRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      await this.ticketAccess.assertCanAccess(toActor(req), req.params.id);

      const results = await this.aiService.getTicketAIResults(
        req.params.id,
        req.tenantId!,
      );
      res.status(200).json(successResponse(results));
    } catch (error) {
      next(error);
    }
  }

  async acceptSuggestion(
    req: AIRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ticketId = await this.aiService.findResultTicketId(
        req.params.id,
        req.tenantId!,
      );
      if (!ticketId) {
        throw new NotFoundError('AI result', req.params.id);
      }
      await this.ticketAccess.assertCanAccess(toActor(req), ticketId);

      await this.aiService.acceptResponseSuggestion(
        req.params.id,
        req.tenantId!,
        req.user!.id,
      );
      res.status(200).json(successResponse({ message: 'Suggestion accepted' }));
    } catch (error) {
      next(error);
    }
  }

  private async queueTicketJob(
    jobType: AIJobType,
    message: string,
    req: AIRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ticket = await this.ticketAccess.assertCanAccess(toActor(req), req.params.id);

      const content = (
        req.body.content?.trim() || `${ticket.title}\n\n${ticket.description}`
      ).slice(0, MAX_AI_CONTENT_LENGTH);

      await this.aiQueue.add({
        jobType,
        tenantId: req.tenantId!,
        ticketId: ticket.id,
        content,
      });

      res.status(202).json(successResponse({ message }));
    } catch (error) {
      next(error);
    }
  }
}

function toActor(req: Pick<Request, 'user' | 'tenantId'>): TicketActor {
  return {
    id: req.user!.id,
    role: req.user!.role,
    email: req.user!.email,
    tenantId: req.tenantId!,
  };
}
