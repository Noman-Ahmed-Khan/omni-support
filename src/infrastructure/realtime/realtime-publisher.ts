import type { RedisClientType } from 'redis';

import type { WSMessage } from './websocket.gateway';
import { logger } from '../../shared/utils/logger.util';

/** Sends realtime events to connected WebSocket clients, wherever they are connected. */
export interface RealtimePublisher {
  sendToUser(userId: string, message: WSMessage): void;
  sendToTenant(tenantId: string, message: WSMessage): void;
  sendToTicket(ticketId: string, message: WSMessage): void;
}

export const REALTIME_CHANNEL = 'omnisupport:realtime';

type Target = 'user' | 'tenant' | 'ticket';

interface RealtimeEnvelope {
  target: Target;
  id: string;
  message: WSMessage;
}

/**
 * Publishes realtime events to Redis. Every API process subscribes (see
 * bridgeRealtimeToGateway) and forwards them to its own clients, so events reach users
 * on any API replica and events raised by the worker process are delivered too.
 */
export class RedisRealtimePublisher implements RealtimePublisher {
  constructor(private readonly redis: Pick<RedisClientType, 'publish'>) {}

  sendToUser(userId: string, message: WSMessage): void {
    this.publish({ target: 'user', id: userId, message });
  }

  sendToTenant(tenantId: string, message: WSMessage): void {
    this.publish({ target: 'tenant', id: tenantId, message });
  }

  sendToTicket(ticketId: string, message: WSMessage): void {
    this.publish({ target: 'ticket', id: ticketId, message });
  }

  private publish(envelope: RealtimeEnvelope): void {
    // Realtime delivery is best effort; the caller must not fail because of it.
    this.redis
      .publish(REALTIME_CHANNEL, JSON.stringify(envelope))
      .catch((error: unknown) => {
        logger.warn('Failed to publish realtime event', {
          target: envelope.target,
          error,
        });
      });
  }
}

/**
 * Subscribes to realtime events on a dedicated Redis connection and delivers them to
 * this process's WebSocket clients. Returns a function that stops the subscription.
 */
export async function bridgeRealtimeToGateway(
  redis: RedisClientType,
  gateway: RealtimePublisher,
): Promise<() => Promise<void>> {
  const subscriber = redis.duplicate();
  subscriber.on('error', (error: unknown) => {
    logger.error('Realtime subscriber error', { error });
  });
  await subscriber.connect();

  await subscriber.subscribe(REALTIME_CHANNEL, (raw) => {
    let envelope: RealtimeEnvelope;
    try {
      envelope = JSON.parse(raw) as RealtimeEnvelope;
    } catch {
      logger.warn('Ignoring malformed realtime event');
      return;
    }

    switch (envelope.target) {
      case 'user':
        gateway.sendToUser(envelope.id, envelope.message);
        break;
      case 'tenant':
        gateway.sendToTenant(envelope.id, envelope.message);
        break;
      case 'ticket':
        gateway.sendToTicket(envelope.id, envelope.message);
        break;
      default:
        logger.warn('Ignoring realtime event with unknown target');
    }
  });

  logger.info('Realtime bridge subscribed', { channel: REALTIME_CHANNEL });

  return async () => {
    await subscriber.unsubscribe(REALTIME_CHANNEL);
    await subscriber.quit();
  };
}
