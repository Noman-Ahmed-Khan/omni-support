import type { PrismaClient } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { mockDeep } from 'jest-mock-extended';

import {
  createTenantMiddleware,
  requireTenantContext,
} from '../../../../src/presentation/http/middlewares/tenant.middleware';
import { ForbiddenError } from '../../../../src/shared/errors/application.error';

function run(
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  req: Partial<Request>,
): Promise<unknown> {
  return new Promise((resolve) => {
    middleware(req as Request, {} as Response, (error?: unknown) => resolve(error));
  });
}

describe('tenant middleware', () => {
  const prisma = mockDeep<PrismaClient>();

  it('rejects non-admin users without an organization', async () => {
    const middleware = createTenantMiddleware(prisma);
    const error = await run(middleware, {
      user: { id: 'u1', email: 'a@b.c', role: 'AGENT' },
    });
    expect(error).toBeInstanceOf(ForbiddenError);
  });

  it('lets tenant-less users through only when explicitly allowed', async () => {
    const middleware = createTenantMiddleware(prisma, { allowTenantless: true });
    const req: Partial<Request> = {
      user: { id: 'u1', email: 'a@b.c', role: 'CUSTOMER' },
    };
    const error = await run(middleware, req);
    expect(error).toBeUndefined();
    expect(req.tenantId).toBeUndefined();
  });

  it('passes platform admins without a tenant context', async () => {
    const middleware = createTenantMiddleware(prisma);
    const req: Partial<Request> = {
      user: { id: 'admin', email: 'a@b.c', role: 'PLATFORM_ADMIN' },
      tenantId: 'spoofed',
    };
    const error = await run(middleware, req);
    expect(error).toBeUndefined();
    expect(req.tenantId).toBeUndefined();
  });

  it('rejects users whose organization does not exist', async () => {
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);
    const middleware = createTenantMiddleware(prisma);
    const error = await run(middleware, {
      user: { id: 'u1', email: 'a@b.c', role: 'AGENT', tenantId: 'missing' },
    });
    expect(error).toBeInstanceOf(ForbiddenError);
  });
});

describe('requireTenantContext', () => {
  it('rejects requests without a tenant', async () => {
    const error = await run(requireTenantContext, {});
    expect(error).toBeInstanceOf(ForbiddenError);
  });

  it('allows requests with a tenant', async () => {
    const error = await run(requireTenantContext, { tenantId: 'tenant-1' });
    expect(error).toBeUndefined();
  });
});
