import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import { logger } from '../../shared/utils/logger.util';
import { WebSocketAuth } from './websocket.auth';
import { RoomManager } from './rooms/room.manager';

export interface WSClient {
  userId: string;
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

export class WebSocketGateway {
  private wss: WebSocketServer;
  private clients: Map<string, WSClient> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private readonly roomManager: RoomManager;
  private readonly wsAuth: WebSocketAuth;

  constructor(server: Server, wsAuth: WebSocketAuth) {
    this.wsAuth = wsAuth;
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

  private async handleConnection(
    socket: WebSocket,
    request: IncomingMessage,
  ): Promise<void> {
    try {
      // Authenticate the connection
      const user = await this.wsAuth.authenticate(request);

      if (!user) {
        socket.close(4001, 'Unauthorized');
        return;
      }

      const clientId = crypto.randomUUID();
      const client: WSClient = {
        userId: user.userId,
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
      if (user.tenantId) {
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

        this.handleMessage(clientId, client, raw);
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

  private handleMessage(clientId: string, client: WSClient, rawData: string): void {
    try {
      const message = JSON.parse(rawData) as WSMessage;

      switch (message.event) {
        case 'subscribe':
          this.handleSubscribe(clientId, client, message.room);
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
    } catch {
      logger.warn('Invalid WebSocket message', { clientId });
    }
  }

  private handleSubscribe(clientId: string, client: WSClient, room?: string): void {
    if (!room) return;

    // Validate room access
    if (!this.canAccessRoom(client, room)) {
      this.sendToClient(client.socket, {
        event: 'error',
        data: { message: 'Access denied to room' },
      });
      return;
    }

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

  private canAccessRoom(client: WSClient, room: string): boolean {
    // Users can only subscribe to their own rooms
    if (room.startsWith('user:')) {
      return room === `user:${client.userId}`;
    }

    // Tenant rooms only accessible by tenant members
    if (room.startsWith('tenant:')) {
      return room === `tenant:${client.tenantId}`;
    }

    // Ticket rooms accessible by tenant members
    if (room.startsWith('ticket:')) {
      return !!client.tenantId;
    }

    return false;
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
