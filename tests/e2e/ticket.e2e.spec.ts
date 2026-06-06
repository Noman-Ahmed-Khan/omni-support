import request from 'supertest';
import { Application } from 'express';
import { getTestApp, getAuthToken } from '../helpers/test-app';
import { getTestPrisma, cleanupTestDatabase } from '../helpers/test-db';
import { createTestCustomer } from '../fixtures/ticket.fixture';

describe('Ticket E2E', () => {
  let app: Application;
  let managerToken: string;
  let agentToken: string;
  let tenantId: string;
  let customerId: string;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
  });

  beforeEach(async () => {
    await cleanupTestDatabase();

    const managerAuth = await getAuthToken(app, 'TENANT_MANAGER');
    managerToken = managerAuth.token;
    tenantId = managerAuth.tenantId;

    const agentAuth = await getAuthToken(app, 'AGENT', tenantId);
    agentToken = agentAuth.token;

    const customer = await createTestCustomer(prisma, tenantId);
    customerId = customer.id;
  });

  describe('POST /api/v1/tickets', () => {
    it('should create ticket as manager', async () => {
      const response = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerId,
          title: 'Test Ticket Title Here',
          description: 'This is a detailed description of the test ticket issue',
          priority: 'HIGH',
          category: 'TECHNICAL',
          tags: ['urgent', 'bug'],
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        title: 'Test Ticket Title Here',
        priority: 'HIGH',
        category: 'TECHNICAL',
        status: 'OPEN',
        tenantId,
      });
      expect(response.body.data.ticketNumber).toBeGreaterThan(0);
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerId,
          // Missing title and description
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('errors');
    });

    it('should return 400 for invalid priority', async () => {
      const response = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerId,
          title: 'Test Title',
          description: 'Test description that is long enough',
          priority: 'INVALID_PRIORITY',
        });

      expect(response.status).toBe(400);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/tickets')
        .send({
          customerId,
          title: 'Test Title',
          description: 'Test description',
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/tickets', () => {
    beforeEach(async () => {
      // Create test tickets
      await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerId,
          title: 'First Ticket',
          description: 'First ticket description for testing pagination',
          priority: 'HIGH',
        });

      await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerId,
          title: 'Second Ticket',
          description: 'Second ticket description for testing pagination',
          priority: 'LOW',
        });
    });

    it('should list all tickets for tenant', async () => {
      const response = await request(app)
        .get('/api/v1/tickets')
        .set('Authorization', `Bearer ${managerToken}`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.meta.total).toBeGreaterThanOrEqual(2);
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/v1/tickets')
        .set('Authorization', `Bearer ${managerToken}`)
        .query({ status: 'OPEN' });

      expect(response.status).toBe(200);
      response.body.data.forEach((ticket: any) => {
        expect(ticket.status).toBe('OPEN');
      });
    });

    it('should paginate correctly', async () => {
      const response = await request(app)
        .get('/api/v1/tickets')
        .set('Authorization', `Bearer ${managerToken}`)
        .query({ page: 1, limit: 1 });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta.limit).toBe(1);
    });
  });

  describe('PATCH /api/v1/tickets/:id/status', () => {
    let ticketId: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerId,
          title: 'Status Change Test',
          description: 'This ticket will have its status changed',
          priority: 'MEDIUM',
        });

      ticketId = response.body.data.id;
    });

    it('should change ticket status', async () => {
      const response = await request(app)
        .patch(`/api/v1/tickets/${ticketId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'IN_PROGRESS' });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('IN_PROGRESS');
    });

    it('should return 422 for invalid status transition', async () => {
      // OPEN -> RESOLVED is not allowed
      const response = await request(app)
        .patch(`/api/v1/tickets/${ticketId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'RESOLVED' });

      expect(response.status).toBe(422);
    });
  });

  describe('POST /api/v1/tickets/:id/escalate', () => {
    let ticketId: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerId,
          title: 'Escalation Test',
          description: 'This ticket will be escalated',
          priority: 'MEDIUM',
        });

      ticketId = response.body.data.id;
    });

    it('should escalate ticket', async () => {
      const response = await request(app)
        .post(`/api/v1/tickets/${ticketId}/escalate`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          reason: 'Customer is very upset and needs immediate attention from management',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.isEscalated).toBe(true);
      expect(response.body.data.priority).toBe('CRITICAL');
    });

    it('should return 400 for short escalation reason', async () => {
      const response = await request(app)
        .post(`/api/v1/tickets/${ticketId}/escalate`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ reason: 'Short' });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/v1/tickets/:id/comments', () => {
    let ticketId: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerId,
          title: 'Comment Test Ticket',
          description: 'This ticket will have comments added to it',
        });

      ticketId = response.body.data.id;
    });

    it('should add public comment', async () => {
      const response = await request(app)
        .post(`/api/v1/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          content: 'This is a public reply to the customer',
          type: 'PUBLIC',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.type).toBe('PUBLIC');
      expect(response.body.data.content).toBe('This is a public reply to the customer');
    });

    it('should add internal note as agent', async () => {
      const response = await request(app)
        .post(`/api/v1/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          content: 'Internal note for the team',
          type: 'INTERNAL',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.type).toBe('INTERNAL');
    });
  });

  describe('Tenant Isolation', () => {
    it('should not allow access to tickets from another tenant', async () => {
      // Create ticket in tenant 1
      const createResponse = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerId,
          title: 'Isolation Test Ticket',
          description: 'This ticket should not be accessible by other tenants',
        });

      const ticketId = createResponse.body.data.id;

      // Try to access as different tenant
      const { token: otherToken } = await getAuthToken(app, 'TENANT_MANAGER');

      const response = await request(app)
        .get(`/api/v1/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(404);
    });
  });
});