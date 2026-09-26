import http from 'http';
import type { AddressInfo } from 'net';

import WebSocket from 'ws';

import type { WebSocketAuth } from '../../../../src/infrastructure/realtime/websocket.auth';
import { WebSocketGateway } from '../../../../src/infrastructure/realtime/websocket.gateway';

type Message = { event: string; data: Record<string, unknown>; room?: string };

describe('WebSocketGateway room authorization (SEC-04)', () => {
  let server: http.Server;
  let gateway: WebSocketGateway;
  let port: number;
  const tickets: Record<string, string> = {
    'ticket-a': 'tenant-a',
    'ticket-b': 'tenant-b',
  };

  beforeAll(async () => {
    server = http.createServer();
    const auth = {
      authenticate: () =>
        Promise.resolve({
          userId: 'user-1',
          email: 'agent@example.com',
          tenantId: 'tenant-a',
          role: 'AGENT',
        }),
    } as unknown as WebSocketAuth;

    gateway = new WebSocketGateway(server, auth, {
      allowedOrigins: ['https://app.example.com'],
      canAccessTicket: (user, ticketId) =>
        Promise.resolve(tickets[ticketId] === user.tenantId),
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await gateway.shutdown();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const connect = async (origin = 'https://app.example.com') => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { origin } });
    const messages: Message[] = [];
    socket.on('message', (raw) => messages.push(JSON.parse(String(raw)) as Message));
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    return { socket, messages };
  };

  const nextMessage = async (messages: Message[], count: number): Promise<Message> => {
    for (let i = 0; i < 50 && messages.length < count; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return messages[count - 1];
  };

  it('lets a client join a ticket room of its own organization', async () => {
    const { socket, messages } = await connect();
    await nextMessage(messages, 1); // connected

    socket.send(JSON.stringify({ event: 'subscribe', room: 'ticket:ticket-a' }));

    expect((await nextMessage(messages, 2)).event).toBe('subscribed');
    socket.close();
  });

  it("denies another organization's ticket room", async () => {
    const { socket, messages } = await connect();
    await nextMessage(messages, 1);

    socket.send(JSON.stringify({ event: 'subscribe', room: 'ticket:ticket-b' }));

    const reply = await nextMessage(messages, 2);
    expect(reply.event).toBe('error');
    socket.close();
  });

  it('denies other tenant and user rooms', async () => {
    const { socket, messages } = await connect();
    await nextMessage(messages, 1);

    socket.send(JSON.stringify({ event: 'subscribe', room: 'tenant:tenant-b' }));
    socket.send(JSON.stringify({ event: 'subscribe', room: 'user:someone-else' }));

    expect((await nextMessage(messages, 2)).event).toBe('error');
    expect((await nextMessage(messages, 3)).event).toBe('error');
    socket.close();
  });

  it('closes connections from origins that are not allowed', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { origin: 'https://evil.example.com' },
    });

    const code = await new Promise<number>((resolve) => socket.once('close', resolve));
    expect(code).toBe(4003);
  });
});
