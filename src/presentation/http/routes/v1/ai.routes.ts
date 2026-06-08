import { Router } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';

import type { Container } from '../../../../infrastructure/di';
import type { AIController, AIRequestBody } from '../../controllers/ai.controller';
import { createAuthMiddleware } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import { asyncHandler } from '../../utils/async-handler';

export function createAIRoutes(container: Container): Router {
  const router = Router();
  const controller: AIController = container.resolve('aiController');
  const authMiddleware = createAuthMiddleware(container.resolve('tokenService'));

  router.use(authMiddleware);

  // Agent / Manager / Admin routes
  const requireAgentOrAbove = requireRole('PLATFORM_ADMIN', 'TENANT_MANAGER', 'AGENT');

  router.post(
    '/tickets/:id/categorize',
    requireAgentOrAbove,
    asyncHandler<ParamsDictionary, unknown, AIRequestBody, unknown>((req, res, next) =>
      controller.triggerCategorization(req, res, next),
    ),
  );

  router.post(
    '/tickets/:id/sentiment',
    requireAgentOrAbove,
    asyncHandler<ParamsDictionary, unknown, AIRequestBody, unknown>((req, res, next) =>
      controller.triggerSentiment(req, res, next),
    ),
  );

  router.post(
    '/tickets/:id/urgency',
    requireAgentOrAbove,
    asyncHandler<ParamsDictionary, unknown, AIRequestBody, unknown>((req, res, next) =>
      controller.triggerUrgency(req, res, next),
    ),
  );

  router.post(
    '/tickets/:id/suggest-response',
    requireAgentOrAbove,
    asyncHandler<ParamsDictionary, unknown, AIRequestBody, unknown>((req, res, next) =>
      controller.triggerSuggestResponse(req, res, next),
    ),
  );

  router.post(
    '/tickets/:id/summarize',
    requireAgentOrAbove,
    asyncHandler<ParamsDictionary, unknown, AIRequestBody, unknown>((req, res, next) =>
      controller.triggerSummary(req, res, next),
    ),
  );

  router.get(
    '/tickets/:id/results',
    requireAgentOrAbove,
    asyncHandler<ParamsDictionary, unknown, AIRequestBody, unknown>((req, res, next) =>
      controller.getTicketResults(req, res, next),
    ),
  );

  router.post(
    '/customers/:id/risk-score',
    requireAgentOrAbove,
    asyncHandler<ParamsDictionary, unknown, AIRequestBody, unknown>((req, res, next) =>
      controller.triggerRiskScore(req, res, next),
    ),
  );

  router.post(
    '/suggestions/:id/accept',
    requireAgentOrAbove,
    asyncHandler<ParamsDictionary, unknown, AIRequestBody, unknown>((req, res, next) =>
      controller.acceptSuggestion(req, res, next),
    ),
  );

  return router;
}
