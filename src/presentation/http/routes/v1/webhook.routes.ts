import { Router } from 'express';
import { WebhookController } from '../../controllers/webhook.controller';

export function createWebhookRoutes(container: any): Router {
  const router = Router();
  const controller: WebhookController = container.resolve('webhookController');

  // WhatsApp webhooks - raw body for signature verification
  router.post(
    '/whatsapp/inbound',
    (req, res, next) => controller.handleWhatsAppInbound(req, res, next),
  );

  router.post(
    '/whatsapp/status',
    (req, res, next) => controller.handleWhatsAppStatus(req, res, next),
  );

  return router;
}
