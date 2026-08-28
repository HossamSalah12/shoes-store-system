import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { assertTenantOwnership, requireTenantId } from '../../src/lib/tenantGuard';
import { AppError } from '../../src/utils/AppError';

describe('tenantGuard.assertTenantOwnership', () => {
  test('returns the row when tenantId matches', () => {
    const row = { id: 'p1', tenantId: 'tenant-hussein', name: 'Nike Air Max' };
    const result = assertTenantOwnership(row, 'tenant-hussein');
    assert.equal(result, row);
  });

  test('throws NOT_FOUND (not FORBIDDEN) when tenantId does not match — this is the core anti-IDOR behavior', () => {
    // Simulates Mohamed's account requesting a product id that belongs to Hussein's tenant.
    const husseinsProduct = { id: 'p1', tenantId: 'tenant-hussein', name: 'Nike Air Max' };

    assert.throws(
      () => assertTenantOwnership(husseinsProduct, 'tenant-mohamed'),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, 'NOT_FOUND', 'must be NOT_FOUND, never FORBIDDEN, to avoid confirming the id exists');
        assert.equal(err.statusCode, 404);
        return true;
      },
    );
  });

  test('throws NOT_FOUND when the row is null (id does not exist at all)', () => {
    assert.throws(() => assertTenantOwnership(null, 'tenant-hussein'), (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.code, 'NOT_FOUND');
      return true;
    });
  });

  test('cross-tenant and nonexistent-id cases are indistinguishable to the caller (same code+status)', () => {
    const husseinsProduct = { id: 'p1', tenantId: 'tenant-hussein' };
    let crossTenantError: AppError | undefined;
    let missingError: AppError | undefined;

    try {
      assertTenantOwnership(husseinsProduct, 'tenant-mohamed');
    } catch (e) {
      crossTenantError = e as AppError;
    }
    try {
      assertTenantOwnership(null, 'tenant-mohamed');
    } catch (e) {
      missingError = e as AppError;
    }

    assert.equal(crossTenantError?.code, missingError?.code);
    assert.equal(crossTenantError?.statusCode, missingError?.statusCode);
    assert.equal(crossTenantError?.message, missingError?.message);
  });
});

describe('tenantGuard.requireTenantId', () => {
  test('returns the tenantId when present', () => {
    assert.equal(requireTenantId('tenant-hussein'), 'tenant-hussein');
  });

  test('throws FORBIDDEN for a platform-level (Super Admin) context with no tenantId', () => {
    assert.throws(() => requireTenantId(null), (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.code, 'FORBIDDEN');
      return true;
    });
  });
});
