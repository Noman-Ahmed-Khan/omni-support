import crypto from 'crypto';

import type { Application } from 'express';
import request from 'supertest';

import { getTestApp, getAuthToken } from '../helpers/test-app';
import { getTestPrisma, cleanupTestDatabase } from '../helpers/test-db';

describe('Auth E2E', () => {
  let app: Application;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
  });

  beforeEach(async () => {
    await cleanupTestDatabase();
  });

  describe('POST /api/v1/auth/register', () => {
    it('no longer exists: accounts are issued through invitations', async () => {
      const response = await request(app).post('/api/v1/auth/register').send({
        email: 'newuser@example.com',
        password: 'TestPass@123!',
        firstName: 'New',
        lastName: 'User',
      });

      expect(response.status).toBe(404);
      expect(
        await prisma.user.findUnique({ where: { email: 'newuser@example.com' } }),
      ).toBeNull();
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      // Create verified user
      const tenant = await prisma.tenant.create({
        data: {
          id: crypto.randomUUID(),
          name: 'Test Org',
          slug: `test-org-${Date.now()}`,
          status: 'ACTIVE',
          plan: 'starter',
          maxAgents: 5,
          maxCustomers: 100,
          maxTicketsPerDay: 100,
        },
      });

      const argon2 = await import('argon2');
      await prisma.user.create({
        data: {
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          email: 'login@example.com',
          passwordHash: await argon2.hash('TestPass@123!'),
          firstName: 'Login',
          lastName: 'User',
          role: 'AGENT',
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
          failedLoginAttempts: 0,
          timezone: 'UTC',
          locale: 'en',
        },
      });
    });

    it('should login with valid credentials', async () => {
      const response = await request(app).post('/api/v1/auth/login').send({
        email: 'login@example.com',
        password: 'TestPass@123!',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user.email).toBe('login@example.com');
    });

    it('should return 401 for wrong password', async () => {
      const response = await request(app).post('/api/v1/auth/login').send({
        email: 'login@example.com',
        password: 'WrongPass@123!',
      });

      expect(response.status).toBe(401);
    });

    it('should return 401 for non-existent email', async () => {
      const response = await request(app).post('/api/v1/auth/login').send({
        email: 'notfound@example.com',
        password: 'TestPass@123!',
      });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return current user with valid token', async () => {
      const { token } = await getAuthToken(app);

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('email');
    });

    it('should return 401 without token', async () => {
      const response = await request(app).get('/api/v1/auth/me');
      expect(response.status).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid.token.here');

      expect(response.status).toBe(401);
    });
  });
});
