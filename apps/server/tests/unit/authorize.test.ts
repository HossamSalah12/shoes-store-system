import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { requirePermission, requireRole, requireSuperAdmin, requireTenantUser } from '../../src/middleware/authorize';
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

/** Minimal fake Express req/res/next for exercising middleware factories directly. */
function runMiddleware(mw: (req: any, res: any, next: any) => void, authContext?: AuthenticatedUserContext) {
  const req: any = { authContext };
  let nextCalled = false;
  let thrown: unknown;
  const next = () => {
    nextCalled = true;
  };
  try {
    mw(req, {} as any, next);
  } catch (err) {
    thrown = err;
  }
  return { nextCalled, thrown };
}

describe('requirePermission', () => {
  test('calls next() when the user has the required permission', () => {
    const ctx = makeContext({ permissions: ['sale.create', 'sale.view'] });
    const { nextCalled, thrown } = runMiddleware(requirePermission('sale.create' as any), ctx);
    assert.equal(nextCalled, true);
    assert.equal(thrown, undefined);
  });

  test('calls next() if user has ANY of multiple required permissions', () => {
    const ctx = makeContext({ permissions: ['report.view_branch'] });
    const { nextCalled } = runMiddleware(requirePermission('report.view_branch' as any, 'report.view_tenant' as any), ctx);
    assert.equal(nextCalled, true);
  });

  test('throws FORBIDDEN when the user lacks the permission — this is how a Cashier without SALE_DISCOUNT is blocked', () => {
    const cashier = makeContext({ roleCodes: ['CASHIER'], permissions: ['sale.create', 'sale.view'] });
    const { nextCalled, thrown } = runMiddleware(requirePermission('sale.apply_discount' as any), cashier);
    assert.equal(nextCalled, false);
    assert.ok(thrown instanceof AppError);
    assert.equal((thrown as AppError).code, 'FORBIDDEN');
  });

  test('throws UNAUTHENTICATED if authContext is missing entirely (authenticate middleware not run)', () => {
    const { thrown } = runMiddleware(requirePermission('sale.create' as any), undefined);
    assert.ok(thrown instanceof AppError);
    assert.equal((thrown as AppError).code, 'UNAUTHENTICATED');
  });
});

describe('requireRole', () => {
  test('allows a matching role', () => {
    const owner = makeContext({ roleCodes: ['OWNER'] });
    const { nextCalled } = runMiddleware(requireRole('OWNER' as any), owner);
    assert.equal(nextCalled, true);
  });

  test('rejects a Cashier trying to access an Owner-only route', () => {
    const cashier = makeContext({ roleCodes: ['CASHIER'] });
    const { thrown } = runMiddleware(requireRole('OWNER' as any), cashier);
    assert.ok(thrown instanceof AppError);
    assert.equal((thrown as AppError).code, 'FORBIDDEN');
  });
});

describe('requireSuperAdmin', () => {
  test('allows SUPER_ADMIN', () => {
    const superAdmin = makeContext({ isSuperAdmin: true, tenantId: null });
    const { nextCalled } = runMiddleware(requireSuperAdmin, superAdmin);
    assert.equal(nextCalled, true);
  });

  test('rejects a tenant OWNER from platform-level routes — Owner cannot manage other tenants', () => {
    const owner = makeContext({ roleCodes: ['OWNER'], isSuperAdmin: false });
    const { thrown } = runMiddleware(requireSuperAdmin, owner);
    assert.ok(thrown instanceof AppError);
    assert.equal((thrown as AppError).code, 'FORBIDDEN');
  });
});

describe('requireTenantUser', () => {
  test('allows a tenant-scoped user', () => {
    const owner = makeContext({ tenantId: 'tenant-hussein' });
    const { nextCalled } = runMiddleware(requireTenantUser, owner);
    assert.equal(nextCalled, true);
  });

  test('rejects a platform Super Admin (tenantId null) from tenant-scoped routes', () => {
    const superAdmin = makeContext({ tenantId: null, isSuperAdmin: true });
    const { thrown } = runMiddleware(requireTenantUser, superAdmin);
    assert.ok(thrown instanceof AppError);
    assert.equal((thrown as AppError).code, 'FORBIDDEN');
  });
});
