import request from 'supertest';
import { Application } from 'express';
import { getTestApp, getAuthToken } from '../helpers/test-app';
import { cleanupTestDatabase } from '../helpers/test-db';

describe('Customer E2E', () => {
  let app: Application;
  let managerToken: string;
  let tenantId: string;

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
  });

  beforeEach(async () => {
    await cleanupTestDatabase();
    const auth = await getAuthToken(app, 'TENANT_MANAGER');
    managerToken = auth.token;
    tenantId = auth.tenantId;
  });

  describe('POST /api/v1/customers', () => {
    it('should create customer successfully', async () => {
      const response = await request(app)
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          fullName: 'John Doe',
          email: 'john@example.com',
          phone: '+1234567890',
          company: 'Acme Corp',
          notes: 'VIP customer',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.fullName).toBe('John Doe');
      expect(response.body.data.email).toBe('john@example.com');
      expect(response.body.data.tenantId).toBe(tenantId);
      expect(response.body.data.status).toBe('ACTIVE');
    });

    it('should return 409 for duplicate email in same tenant', async () => {
      await request(app)
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          fullName: 'John Doe',
          email: 'duplicate@example.com',
        });

      const response = await request(app)
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          fullName: 'Jane Doe',
          email: 'duplicate@example.com',
        });

      expect(response.status).toBe(409);
    });

    it('should return 400 for invalid email', async () => {
      const response = await request(app)
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          fullName: 'John Doe',
          email: 'not-an-email',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/customers', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ fullName: 'Customer One', email: 'one@example.com' });

      await request(app)
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ fullName: 'Customer Two', email: 'two@example.com' });
    });

    it('should list customers with pagination', async () => {
      const response = await request(app)
        .get('/api/v1/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
      expect(response.body.meta).toHaveProperty('total');
      expect(response.body.meta).toHaveProperty('totalPages');
    });
  });

  describe('GET /api/v1/customers/:id/timeline', () => {
    it('should return customer timeline', async () => {
      const createResponse = await request(app)
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          fullName: 'Timeline Customer',
          email: 'timeline@example.com',
        });

      const customerId = createResponse.body.data.id;

      const response = await request(app)
        .get(`/api/v1/customers/${customerId}/timeline`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
    });
  });
});