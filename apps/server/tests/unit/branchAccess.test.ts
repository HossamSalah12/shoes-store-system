import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hasBranchAccess, assertBranchAccess } from '../../src/middleware/branchAccess';
import { AppError } from '../../src/utils/AppError';
import type { AuthenticatedUserContext } from '@shoes/shared';

function makeContext(overrides: Partial<AuthenticatedUserContext>): AuthenticatedUserContext {
  return {
    userId: 'u1',
    tenantId: 't1',
    sessionId: 's1',
    roleCodes: [],
    permissions: [],
    branchIds: [],
    isSuperAdmin: false,
    ...overrides,
  };
}

describe('hasBranchAccess', () => {
  test('OWNER has implicit access to any branch (of their own tenant)', () => {
    const owner = makeContext({ roleCodes: ['OWNER'], branchIds: [] });
    assert.equal(hasBranchAccess(owner, 'branch-cairo'), true);
    assert.equal(hasBranchAccess(owner, 'branch-alexandria'), true);
    assert.equal(hasBranchAccess(owner, 'any-random-branch-id'), true);
  });

  test('BRANCH_MANAGER only has access to explicitly assigned branches', () => {
    const manager = makeContext({ roleCodes: ['BRANCH_MANAGER'], branchIds: ['branch-cairo'] });
    assert.equal(hasBranchAccess(manager, 'branch-cairo'), true);
    assert.equal(hasBranchAccess(manager, 'branch-alexandria'), false);
  });

  test('CASHIER only has access to explicitly assigned branches', () => {
    const cashier = makeContext({ roleCodes: ['CASHIER'], branchIds: ['branch-tanta'] });
    assert.equal(hasBranchAccess(cashier, 'branch-tanta'), true);
    assert.equal(hasBranchAccess(cashier, 'branch-cairo'), false);
  });

  test('a user assigned to zero branches has no branch access at all', () => {
    const cashier = makeContext({ roleCodes: ['CASHIER'], branchIds: [] });
    assert.equal(hasBranchAccess(cashier, 'branch-cairo'), false);
  });

  test('SUPER_ADMIN is not implicitly granted branch access', () => {
    const superAdmin = makeContext({ roleCodes: ['SUPER_ADMIN'], isSuperAdmin: true, tenantId: null, branchIds: [] });
    assert.equal(hasBranchAccess(superAdmin, 'branch-cairo'), false);
  });
});

describe('assertBranchAccess', () => {
  test('does not throw when access is allowed', () => {
    const owner = makeContext({ roleCodes: ['OWNER'] });
    assert.doesNotThrow(() => assertBranchAccess(owner, 'branch-cairo'));
  });

  test('throws FORBIDDEN when access is denied', () => {
    const cashier = makeContext({ roleCodes: ['CASHIER'], branchIds: ['branch-cairo'] });
    assert.throws(() => assertBranchAccess(cashier, 'branch-alexandria'), (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.code, 'FORBIDDEN');
      return true;
    });
  });
});
