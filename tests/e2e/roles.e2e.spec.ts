import type { Application } from 'express';
import request from 'supertest';

import {
  DEFAULT_GRANTS,
  TENANT_PERMISSIONS,
} from '../../src/domain/policies/permission.catalog';
import { getAuthToken, getPlatformAdminToken, getTestApp } from '../helpers/test-app';
import { cleanupTestDatabase, getTestPrisma } from '../helpers/test-db';

describe('Roles and permissions E2E', () => {
  let app: Application;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    app = (await getTestApp()).app;
  });
  beforeEach(async () => {
    await cleanupTestDatabase();
  });

  const createRole = (token: string, body: Record<string, unknown>) =>
    request(app).post('/api/v1/roles').set('Authorization', `Bearer ${token}`).send(body);

  it('backfilled system roles give every account class its previous grants', async () => {
    const manager = await getAuthToken(app);
    const roles = await request(app)
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${manager.token}`);
    expect(roles.status).toBe(200);
    for (const accountClass of ['TENANT_MANAGER', 'AGENT', 'CUSTOMER'] as const) {
      const role = roles.body.data.find(
        (item: { name: string }) => item.name === accountClass,
      );
      expect(role).toMatchObject({ isSystem: true });
      expect(role.permissions).toEqual([...DEFAULT_GRANTS[accountClass]].sort());
    }

    for (const [role, expected] of [
      ['TENANT_MANAGER', [...TENANT_PERMISSIONS].sort()],
      ['AGENT', [...DEFAULT_GRANTS.AGENT].sort()],
      ['CUSTOMER', ['tickets:create']],
    ] as const) {
      const user = await getAuthToken(app, role, manager.tenantId);
      const me = await request(app)
        .get('/api/v1/users/me/permissions')
        .set('Authorization', `Bearer ${user.token}`);
      expect(me.body.data.permissions).toEqual(expected);
    }
  });

  it('grants an agent analytics through a tenant role, and revokes it', async () => {
    const manager = await getAuthToken(app);
    const agent = await getAuthToken(app, 'AGENT', manager.tenantId);
    const trends = () =>
      request(app)
        .get('/api/v1/analytics/trends')
        .set('Authorization', `Bearer ${agent.token}`);
    expect((await trends()).status).toBe(403);

    const role = await createRole(manager.token, {
      name: 'analyst',
      displayName: 'Analyst',
      permissions: ['analytics:read'],
    });
    expect(role.status).toBe(201);
    const assign = await request(app)
      .put(`/api/v1/roles/${role.body.data.id}/members/${agent.userId}`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(assign.status).toBe(204);
    expect((await trends()).status).not.toBe(403);

    const permissions = await request(app)
      .get(`/api/v1/users/${agent.userId}/permissions`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(permissions.body.data.permissions).toContain('analytics:read');
    expect(permissions.body.data.roles[0].name).toBe('analyst');

    await request(app)
      .delete(`/api/v1/roles/${role.body.data.id}/members/${agent.userId}`)
      .set('Authorization', `Bearer ${manager.token}`)
      .expect(204);
    expect((await trends()).status).toBe(403);

    const audit = await prisma.auditLog.count({
      where: { resourceId: agent.userId, action: 'ROLE_CHANGE' },
    });
    expect(audit).toBe(2);
  });

  it('keeps grants within the account class and the granting manager', async () => {
    const manager = await getAuthToken(app);
    const agent = await getAuthToken(app, 'AGENT', manager.tenantId);
    const customer = await getAuthToken(app, 'CUSTOMER', manager.tenantId);

    // Platform privileges are never grantable by a tenant.
    const platform = await createRole(manager.token, {
      name: 'ops',
      displayName: 'Ops',
      permissions: ['platform:operations'],
    });
    expect(platform.status).toBe(400);

    const admin = await createRole(manager.token, {
      name: 'people',
      displayName: 'People',
      permissions: ['users:manage'],
    });
    expect(admin.status).toBe(201);
    // users:manage is outside the AGENT boundary.
    const toAgent = await request(app)
      .put(`/api/v1/roles/${admin.body.data.id}/members/${agent.userId}`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(toAgent.status).toBe(400);

    const support = await createRole(manager.token, {
      name: 'support',
      displayName: 'Support',
      permissions: ['customers:read'],
    });
    const toCustomer = await request(app)
      .put(`/api/v1/roles/${support.body.data.id}/members/${customer.userId}`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(toCustomer.status).toBe(400);

    // An agent cannot manage roles at all.
    const byAgent = await createRole(agent.token, {
      name: 'mine',
      displayName: 'Mine',
      permissions: ['tickets:assign'],
    });
    expect(byAgent.status).toBe(403);

    // Managers cannot change their own roles.
    const self = await request(app)
      .put(`/api/v1/roles/${support.body.data.id}/members/${manager.userId}`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(self.status).toBe(403);
  });

  it('protects system roles', async () => {
    const manager = await getAuthToken(app);
    const system = await prisma.role.findFirstOrThrow({
      where: { tenantId: null, name: 'AGENT' },
    });
    const update = await request(app)
      .patch(`/api/v1/roles/${system.id}`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send({ permissions: ['tickets:assign'] });
    expect(update.status).toBe(403);
    const remove = await request(app)
      .delete(`/api/v1/roles/${system.id}`)
      .set('Authorization', `Bearer ${manager.token}`);
    expect(remove.status).toBe(403);
    const reserved = await createRole(manager.token, {
      name: 'agent',
      displayName: 'Agent',
      permissions: [],
    });
    expect(reserved.status).toBe(400);
  });

  it('isolates tenant roles between organizations', async () => {
    const managerA = await getAuthToken(app);
    const managerB = await getAuthToken(app);
    const agentB = await getAuthToken(app, 'AGENT', managerB.tenantId);
    const role = await createRole(managerA.token, {
      name: 'triage',
      displayName: 'Triage',
      permissions: ['tickets:assign'],
    });
    const id = role.body.data.id as string;

    for (const call of [
      request(app).get(`/api/v1/roles/${id}`),
      request(app).patch(`/api/v1/roles/${id}`).send({ displayName: 'x' }),
      request(app).delete(`/api/v1/roles/${id}`),
      request(app).get(`/api/v1/roles/${id}/members`),
      request(app).put(`/api/v1/roles/${id}/members/${agentB.userId}`),
    ]) {
      const response = await call.set('Authorization', `Bearer ${managerB.token}`);
      expect(response.status).toBe(404);
    }
    // A manager cannot put another organization's user into their role.
    const foreignMember = await request(app)
      .put(`/api/v1/roles/${id}/members/${agentB.userId}`)
      .set('Authorization', `Bearer ${managerA.token}`);
    expect(foreignMember.status).toBe(404);
  });

  it('rejects role updates that would exceed a member boundary', async () => {
    const manager = await getAuthToken(app);
    const agent = await getAuthToken(app, 'AGENT', manager.tenantId);
    const role = await createRole(manager.token, {
      name: 'lead',
      displayName: 'Lead',
      permissions: ['tickets:assign'],
    });
    await request(app)
      .put(`/api/v1/roles/${role.body.data.id}/members/${agent.userId}`)
      .set('Authorization', `Bearer ${manager.token}`)
      .expect(204);

    const widen = await request(app)
      .patch(`/api/v1/roles/${role.body.data.id}`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send({ permissions: ['tickets:assign', 'roles:manage'] });
    expect(widen.status).toBe(409);
  });

  it('keeps platform routes closed to tenant managers', async () => {
    const manager = await getAuthToken(app);
    const admin = await getPlatformAdminToken();
    for (const path of [
      '/api/v1/admin/outbox',
      '/api/v1/admin/webhooks',
      '/api/v1/tenants',
    ]) {
      const denied = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${manager.token}`);
      expect(denied.status).toBe(403);
      const allowed = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(allowed.status).toBe(200);
    }
    const catalog = await request(app)
      .get('/api/v1/roles/permissions')
      .set('Authorization', `Bearer ${manager.token}`);
    expect(catalog.status).toBe(200);
    expect(
      catalog.body.data.find(
        (item: { key: string }) => item.key === 'platform:operations',
      ).boundary,
    ).toEqual(['PLATFORM_ADMIN']);
  });
});
