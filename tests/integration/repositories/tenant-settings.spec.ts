import { PrismaFeatureFlagRepository } from '../../../src/infrastructure/database/repositories/feature.repository';
import { TenantRepository } from '../../../src/infrastructure/database/repositories/tenant.repository';
import { createTestTenant } from '../../fixtures/tenant.fixture';
import { cleanupTestDatabase, getTestPrisma } from '../../helpers/test-db';

describe('Tenant settings concurrency (Integration)', () => {
  const prisma = getTestPrisma();
  const flags = new PrismaFeatureFlagRepository(prisma);
  const tenants = new TenantRepository(prisma);
  let tenantId: string;

  beforeEach(async () => {
    await cleanupTestDatabase();
    tenantId = (await createTestTenant(prisma)).id;
  });

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  it('keeps every flag when flags are written concurrently', async () => {
    await Promise.all(
      ['a', 'b', 'c', 'd', 'e'].map((name) =>
        flags.setTenantFlag(tenantId, name, { enabled: true }),
      ),
    );

    expect(Object.keys(await flags.getTenantFlags(tenantId)).sort()).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });

  it('does not drop flags written after the tenant was loaded for an update', async () => {
    const tenant = await tenants.findById(tenantId);
    await flags.setTenantFlag(tenantId, 'late-flag', { enabled: true });

    tenant!.updateSettings({ timezone: 'UTC' });
    await tenants.update(tenant!);

    expect(await flags.getTenantFlags(tenantId)).toHaveProperty('late-flag');
    const stored = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    expect(stored.settings).toMatchObject({ timezone: 'UTC' });
  });

  it('removes only the requested flag', async () => {
    await flags.setTenantFlag(tenantId, 'keep', { enabled: true });
    await flags.setTenantFlag(tenantId, 'drop', { enabled: false });

    await flags.deleteTenantFlag(tenantId, 'drop');

    expect(Object.keys(await flags.getTenantFlags(tenantId))).toEqual(['keep']);
  });
});
