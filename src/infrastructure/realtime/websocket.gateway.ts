import type { IncomingMessage, Server } from 'http';

import { WebSocketServer, WebSocket } from 'ws';

import { RoomManager } from './rooms/room.manager';
import type { WebSocketAuth } from './websocket.auth';
import { logger } from '../../shared/utils/logger.util';

export interface WSClient {
  userId: string;
  email: string;
  tenantId?: string;
  role: string;
  socket: WebSocket;
  isAlive: boolean;
  rooms: Set<string>;
}

export interface WSMessage {
  event: string;
  data: unknown;
  room?: string;
}

export interface WebSocketGatewayOptions {
  /**
   * Returns true when the connected user may see the ticket (same organization and
   * the ticket visibility rules). Ticket rooms are denied when no checker is configured.
   */
  canAccessTicket?: (
    user: { userId: string; email: string; role: string; tenantId: string },
    ticketId: string,
  ) => Promise<boolean>;
  /**
   * Returns true when the user holds the permission (same effective permissions as the
   * HTTP API). Without a checker, only tenant managers may join tenant rooms.
   */
  hasPermission?: (
    user: { userId: string; role: string; tenantId?: string },
    permission: string,
  ) => Promise<boolean>;
  /** Browser origins allowed to open a socket. Requests without an Origin header are allowed. */
  allowedOrigins?: string[];
}

export class WebSocketGateway {
  private wss: WebSocketServer;
  private clients: Map<string, WSClient> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private readonly roomManager: RoomManager;
  private readonly wsAuth: WebSocketAuth;
  private readonly options: WebSocketGatewayOptions;

  constructor(
    server: Server,
    wsAuth: WebSocketAuth,
    options: WebSocketGatewayOptions = {},
  ) {
    this.wsAuth = wsAuth;
    this.options = options;
    this.roomManager = new RoomManager();

    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      clientTracking: true,
      maxPayload: 1024 * 64, // 64KB max message size
    });

    this.initialize();
  }

  private initialize(): void {
    this.wss.on('connection', (socket, request) => {
      void this.handleConnection(socket, request);
    });
    this.wss.on('error', (error) => {
      logger.error('WebSocket server error', { error });
    });

    // Heartbeat to detect broken connections
    this.pingInterval = setInterval(() => {
      this.heartbeat();
    }, 30000);

    logger.info('WebSocket gateway initialized');
  }

  private isOriginAllowed(request: IncomingMessage): boolean {
    const origin = request.headers.origin;
    if (!origin || !this.options.allowedOrigins) return true;
    return this.options.allowedOrigins.includes(origin);
  }

  private async handleConnection(
    socket: WebSocket,
    request: IncomingMessage,
  ): Promise<void> {
    try {
      if (!this.isOriginAllowed(request)) {
        socket.close(4003, 'Origin not allowed');
        return;
      }

      // Authenticate the connection
      const user = await this.wsAuth.authenticate(request);

      if (!user) {
        socket.close(4001, 'Unauthorized');
        return;
      }

      const clientId = crypto.randomUUID();
      const client: WSClient = {
        userId: user.userId,
        email: user.email,
        tenantId: user.tenantId,
        role: user.role,
        socket,
        isAlive: true,
        rooms: new Set(),
      };

      this.clients.set(clientId, client);

      // Auto-subscribe to personal room
      this.roomManager.joinRoom(clientId, `user:${user.userId}`);
      client.rooms.add(`user:${user.userId}`);

      // Auto-subscribe to tenant room
      if (user.tenantId && (await this.canAccessTenantRoom(client))) {
        this.roomManager.joinRoom(clientId, `tenant:${user.tenantId}`);
        client.rooms.add(`tenant:${user.tenantId}`);
      }

      logger.info('WebSocket client connected', {
        clientId,
        userId: user.userId,
        tenantId: user.tenantId,
      });

      // Send connection confirmation
      this.sendToClient(socket, {
        event: 'connected',
        data: { clientId, userId: user.userId },
      });

      socket.on('message', (data) => {
        // Ensure we stringify the incoming payload safely
        let raw: string;
        if (typeof data === 'string') raw = data;
        else if (data instanceof Buffer) raw = data.toString();
        else {
          try {
            raw = JSON.stringify(data);
          } catch {
            raw = String(data);
          }
        }

        void this.handleMessage(clientId, client, raw);
      });

      socket.on('pong', () => {
        client.isAlive = true;
      });

      socket.on('close', () => {
        this.handleDisconnect(clientId);
      });

      socket.on('error', (error) => {
        logger.error('WebSocket client error', { clientId, error });
        this.handleDisconnect(clientId);
      });
    } catch (error) {
      logger.error('WebSocket connection error', { error });
      socket.close(4000, 'Connection error');
    }
  }

  private async handleMessage(
    clientId: string,
    client: WSClient,
    rawData: string,
  ): Promise<void> {
    let message: WSMessage;
    try {
      message = JSON.parse(rawData) as WSMessage;
    } catch {
      logger.warn('Invalid WebSocket message', { clientId });
      return;
    }

    try {
      switch (message.event) {
        case 'subscribe':
          await this.handleSubscribe(clientId, client, message.room);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(clientId, client, message.room);
          break;
        case 'ping':
          this.sendToClient(client.socket, { event: 'pong', data: {} });
          break;
        default:
          logger.warn('Unknown WebSocket event', { event: message.event });
      }
    } catch (error) {
      logger.error('WebSocket message handling failed', { clientId, error });
    }
  }

  private async handleSubscribe(
    clientId: string,
    client: WSClient,
    room?: string,
  ): Promise<void> {
    if (!room || typeof room !== 'string') return;

    // Validate room access
    if (!(await this.canAccessRoom(client, room))) {
      this.sendToClient(client.socket, {
        event: 'error',
        data: { message: 'Access denied to room' },
      });
      return;
    }

    // The client may have disconnected while access was being checked
    if (!this.clients.has(clientId)) return;

    this.roomManager.joinRoom(clientId, room);
    client.rooms.add(room);

    this.sendToClient(client.socket, {
      event: 'subscribed',
      data: { room },
    });
  }

  private handleUnsubscribe(clientId: string, client: WSClient, room?: string): void {
    if (!room) return;
    this.roomManager.leaveRoom(clientId, room);
    client.rooms.delete(room);
  }

  private async canAccessRoom(client: WSClient, room: string): Promise<boolean> {
    // Users can only subscribe to their own rooms
    if (room.startsWith('user:')) {
      return room === `user:${client.userId}`;
    }

    // Tenant rooms only accessible by tenant members
    if (room.startsWith('tenant:')) {
      return (
        !!client.tenantId &&
        room === `tenant:${client.tenantId}` &&
        (await this.canAccessTenantRoom(client))
      );
    }

    // Ticket rooms: the ticket must belong to the client's tenant
    if (room.startsWith('ticket:')) {
      const ticketId = room.slice('ticket:'.length);
      if (!client.tenantId || !ticketId || !this.options.canAccessTicket) {
        return false;
      }
      return this.options.canAccessTicket(
        {
          userId: client.userId,
          email: client.email,
          role: client.role,
          tenantId: client.tenantId,
        },
        ticketId,
      );
    }

    return false;
  }

  private async canAccessTenantRoom(client: WSClient): Promise<boolean> {
    if (!this.options.hasPermission) return client.role === 'TENANT_MANAGER';
    return this.options.hasPermission(
      { userId: client.userId, role: client.role, tenantId: client.tenantId },
      'realtime:tenant',
    );
  }

  /** Drops rooms the client may no longer see (permission or assignment changed). */
  private async revalidateRooms(clientId: string, client: WSClient): Promise<void> {
    for (const room of [...client.rooms]) {
      if (room.startsWith('user:')) continue;
      if (!(await this.canAccessRoom(client, room))) {
        this.roomManager.leaveRoom(clientId, room);
        client.rooms.delete(room);
        this.sendToClient(client.socket, { event: 'unsubscribed', data: { room } });
      }
    }
  }

  private handleDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.roomManager.removeClient(clientId);
      this.clients.delete(clientId);

      logger.info('WebSocket client disconnected', {
        clientId,
        userId: client.userId,
      });
    }
  }

  private heartbeat(): void {
    this.clients.forEach((client, clientId) => {
      void this.wsAuth
        .isStillAuthorized(client)
        .then((authorized) => {
          if (!authorized) {
            client.socket.close(4001, 'Session no longer valid');
            this.handleDisconnect(clientId);
            return;
          }
          return this.revalidateRooms(clientId, client);
        })
        .catch((error: unknown) => {
          logger.warn('WebSocket account recheck failed', { clientId, error });
        });
      if (!client.isAlive) {
        client.socket.terminate();
        this.handleDisconnect(clientId);
        return;
      }

      client.isAlive = false;
      client.socket.ping();
    });
  }

  // Public API for sending events
  sendToUser(userId: string, message: WSMessage): void {
    const room = `user:${userId}`;
    this.broadcastToRoom(room, message);
  }

  sendToTenant(tenantId: string, message: WSMessage): void {
    const room = `tenant:${tenantId}`;
    this.broadcastToRoom(room, message);
  }

  sendToTicket(ticketId: string, message: WSMessage): void {
    const room = `ticket:${ticketId}`;
    this.broadcastToRoom(room, message);
  }

  broadcastToRoom(room: string, message: WSMessage): void {
    const clientIds = this.roomManager.getClientsInRoom(room);

    clientIds.forEach((clientId) => {
      const client = this.clients.get(clientId);
      if (client && client.socket.readyState === WebSocket.OPEN) {
        this.sendToClient(client.socket, message);
      }
    });
  }

  private sendToClient(socket: WebSocket, message: WSMessage): void {
    try {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    } catch (error) {
      logger.error('Failed to send WebSocket message', { error });
    }
  }

  async shutdown(): Promise<void> {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    this.clients.forEach((client) => {
      client.socket.close(1001, 'Server shutting down');
    });

    await new Promise<void>((resolve) => {
      this.wss.close(() => resolve());
    });

    logger.info('WebSocket gateway shut down');
  }

  getConnectedCount(): number {
    return this.clients.size;
  }
}
