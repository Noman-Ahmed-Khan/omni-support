import { RoleAssignmentPolicy } from '../../../../src/domain/policies/role-assignment.policy';

describe('RoleAssignmentPolicy', () => {
  const policy = new RoleAssignmentPolicy();

  const manager = { id: 'manager-1', role: 'TENANT_MANAGER', tenantId: 'tenant-a' };
  const admin = { id: 'admin-1', role: 'PLATFORM_ADMIN' };

  describe('tenant manager', () => {
    it('cannot grant PLATFORM_ADMIN to a user in their tenant', () => {
      const decision = policy.evaluate(
        manager,
        { id: 'agent-1', role: 'AGENT', tenantId: 'tenant-a' },
        'PLATFORM_ADMIN',
      );
      expect(decision.allowed).toBe(false);
    });

    it('cannot change their own role', () => {
      const decision = policy.evaluate(
        manager,
        { id: manager.id, role: 'TENANT_MANAGER', tenantId: 'tenant-a' },
        'PLATFORM_ADMIN',
      );
      expect(decision.allowed).toBe(false);
    });

    it('cannot promote an agent to TENANT_MANAGER', () => {
      const decision = policy.evaluate(
        manager,
        { id: 'agent-1', role: 'AGENT', tenantId: 'tenant-a' },
        'TENANT_MANAGER',
      );
      expect(decision.allowed).toBe(false);
    });

    it('cannot demote another manager', () => {
      const decision = policy.evaluate(
        manager,
        { id: 'manager-2', role: 'TENANT_MANAGER', tenantId: 'tenant-a' },
        'AGENT',
      );
      expect(decision.allowed).toBe(false);
    });

    it('cannot change roles of users in another tenant', () => {
      const decision = policy.evaluate(
        manager,
        { id: 'agent-9', role: 'AGENT', tenantId: 'tenant-b' },
        'CUSTOMER',
      );
      expect(decision.allowed).toBe(false);
    });

    it('can move a user in their tenant between AGENT and CUSTOMER', () => {
      expect(
        policy.evaluate(
          manager,
          { id: 'agent-1', role: 'AGENT', tenantId: 'tenant-a' },
          'CUSTOMER',
        ).allowed,
      ).toBe(true);
      expect(
        policy.evaluate(
          manager,
          { id: 'customer-1', role: 'CUSTOMER', tenantId: 'tenant-a' },
          'AGENT',
        ).allowed,
      ).toBe(true);
    });
  });

  describe('platform admin', () => {
    it('cannot grant PLATFORM_ADMIN to a tenant user', () => {
      const decision = policy.evaluate(
        admin,
        { id: 'agent-1', role: 'AGENT', tenantId: 'tenant-a' },
        'PLATFORM_ADMIN',
      );
      expect(decision.allowed).toBe(false);
    });

    it('can assign tenant roles to tenant users', () => {
      const decision = policy.evaluate(
        admin,
        { id: 'agent-1', role: 'AGENT', tenantId: 'tenant-a' },
        'TENANT_MANAGER',
      );
      expect(decision.allowed).toBe(true);
    });

    it('cannot give a tenant role to a user without an organization', () => {
      const decision = policy.evaluate(
        admin,
        { id: 'admin-2', role: 'PLATFORM_ADMIN' },
        'AGENT',
      );
      expect(decision.allowed).toBe(false);
    });
  });

  it('denies agents and customers', () => {
    const target = { id: 'user-2', role: 'CUSTOMER', tenantId: 'tenant-a' };
    expect(
      policy.evaluate({ id: 'a', role: 'AGENT', tenantId: 'tenant-a' }, target, 'AGENT')
        .allowed,
    ).toBe(false);
    expect(
      policy.evaluate(
        { id: 'c', role: 'CUSTOMER', tenantId: 'tenant-a' },
        target,
        'AGENT',
      ).allowed,
    ).toBe(false);
  });
});
