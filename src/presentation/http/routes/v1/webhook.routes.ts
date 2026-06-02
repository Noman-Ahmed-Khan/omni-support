import { Router } from 'express';
import { WebhookController } from '../../controllers/webhook.controller';
import { Container } from '../../../../container';
import { asyncHandler } from '../../utils/async-handler';

export function createWebhookRoutes(container: Container): Router {
  const router = Router();
  const controller: WebhookController = container.resolve('webhookController');

  // WhatsApp webhooks - raw body for signature verification
  router.post(
    '/whatsapp/inbound',
    asyncHandler((req, res, next) => controller.handleWhatsAppInbound(req, res, next)),
  );

  router.post('/whatsapp/status', (req, res, next) =>
    controller.handleWhatsAppStatus(req, res, next),
  );

  return router;
}
