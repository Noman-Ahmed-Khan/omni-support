import type { Request, Response, NextFunction } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';

import type { AnalyzeSentimentHandler } from '../../../application/ai/handlers/analyze-sentiment.handler';
import type { CalculateRiskScoreHandler } from '../../../application/ai/handlers/calculate-risk-score.handler';
import type { CategorizeTicketHandler } from '../../../application/ai/handlers/categorize-ticket.handler';
import type { GenerateSummaryHandler } from '../../../application/ai/handlers/generate-summary.handler';
import type { PredictUrgencyHandler } from '../../../application/ai/handlers/predict-urgency.handler';
import type { SuggestResponseHandler } from '../../../application/ai/handlers/suggest-response.handler';
import type { AIService } from '../../../application/ai/services/ai.service';
import { successResponse } from '../dtos/common/response.dto';

export type AIRequestBody = {
  content?: string;
};

type AIRequest = Request<ParamsDictionary, unknown, AIRequestBody, unknown>;

export class AIController {
  constructor(
    private readonly aiService: AIService,
    private readonly categorizeHandler: CategorizeTicketHandler,
    private readonly sentimentHandler: AnalyzeSentimentHandler,
    private readonly urgencyHandler: PredictUrgencyHandler,
    private readonly suggestResponseHandler: SuggestResponseHandler,
    private readonly summaryHandler: GenerateSummaryHandler,
    private readonly riskScoreHandler: CalculateRiskScoreHandler,
  ) {}

  async triggerCategorization(
    req: AIRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      await this.categorizeHandler.execute({
        tenantId: req.tenantId!,
        ticketId: req.params.id,
        content: req.body.content || '',
      });
      res.status(202).json(successResponse({ message: 'Categorization job queued' }));
    } catch (error) {
      next(error);
    }
  }

  async triggerSentiment(
    req: AIRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      await this.sentimentHandler.execute({
        tenantId: req.tenantId!,
        ticketId: req.params.id,
        content: req.body.content || '',
      });
      res.status(202).json(successResponse({ message: 'Sentiment job queued' }));
    } catch (error) {
      next(error);
    }
  }

  async triggerUrgency(req: AIRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.urgencyHandler.execute({
        tenantId: req.tenantId!,
        ticketId: req.params.id,
        content: req.body.content || '',
      });
      res.status(202).json(successResponse({ message: 'Urgency prediction job queued' }));
    } catch (error) {
      next(error);
    }
  }

  async triggerSuggestResponse(
    req: AIRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      await this.suggestResponseHandler.execute({
        tenantId: req.tenantId!,
        ticketId: req.params.id,
        content: req.body.content || '',
      });
      res.status(202).json(successResponse({ message: 'Suggest response job queued' }));
    } catch (error) {
      next(error);
    }
  }

  async triggerSummary(req: AIRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.summaryHandler.execute({
        tenantId: req.tenantId!,
        ticketId: req.params.id,
        content: req.body.content || '',
      });
      res.status(202).json(successResponse({ message: 'Summary generation job queued' }));
    } catch (error) {
      next(error);
    }
  }

  async triggerRiskScore(
    req: AIRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      await this.riskScoreHandler.execute({
        tenantId: req.tenantId!,
        customerId: req.params.id,
        content: req.body.content || '',
      });
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
}
