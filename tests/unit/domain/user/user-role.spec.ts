import { UserRole as PrismaUserRole } from '@prisma/client';

import {
  UserRole,
  UserRoleEnum,
} from '../../../../src/domain/user/value-objects/user-role.vo';

// Compile-time check (npm run typecheck:all): the domain role list and the database enum
// must contain exactly the same values.
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const rolesMatchDatabase: Equal<`${UserRoleEnum}`, PrismaUserRole> = true;

describe('UserRole', () => {
  it('has the same values as the database enum', () => {
    expect(rolesMatchDatabase).toBe(true);
    expect(Object.values(UserRoleEnum).sort()).toEqual(
      Object.values(PrismaUserRole).sort(),
    );
  });

  it('rejects unknown roles', () => {
    expect(() => UserRole.create('SUPERUSER')).toThrow();
  });
});
