import type { Request, Response } from 'express';

import type { HealthService } from '../../../infrastructure/observability/health/health.service';
import type { WebSocketGateway } from '../../../infrastructure/realtime/websocket.gateway';

export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly wsGateway: WebSocketGateway,
  ) {}

  liveness(_req: Request, res: Response): void {
    res.status(200).json(this.healthService.liveness());
  }

  async readiness(_req: Request, res: Response): Promise<void> {
    const snapshot = await this.healthService.readiness();
    res.status(snapshot.status === 'ok' ? 200 : 503).json(snapshot);
  }

  async full(_req: Request, res: Response): Promise<void> {
    const snapshot = await this.healthService.full();
    res.status(snapshot.status === 'ok' ? 200 : 503).json({
      ...snapshot,
      websocket: {
        connectedClients: this.wsGateway.getConnectedCount(),
      },
    });
  }

  metrics(_req: Request, res: Response): void {
    res
      .status(200)
      .setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
      .send(this.healthService.metricsText());
  }
}
