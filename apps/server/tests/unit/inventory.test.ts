import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { applyStockMovement } from '../../src/modules/inventory/stockMovement';
import { AppError } from '../../src/utils/AppError';

/**
 * A minimal in-memory fake that implements just enough of the Prisma
 * `stockMovement` / `stockLevel` delegate surface for `applyStockMovement`
 * to run against. This validates the BUSINESS LOGIC (branching between
 * increase/decrease movement types, refusal to go negative, per
 * variant+branch bucketing) exactly as written in the real service.
 *
 * IMPORTANT — what this test does NOT prove: true concurrency-safety under
 * simultaneous requests depends on PostgreSQL executing the conditional
 * `UPDATE ... WHERE quantity >= :delta` atomically, which this in-memory
 * fake cannot exercise (it's single-threaded JS). That guarantee is
 * exercised by tests/integration/inventoryConcurrency.test.ts, which
 * requires a real PostgreSQL connection and is skipped automatically when
 * DATABASE_URL is not set (see that file's header comment).
 */
function createFakePrismaClient() {
  const stockLevels = new Map<string, { id: string; tenantId: string; variantId: string; branchId: string; quantity: number }>();
  const movements: unknown[] = [];
  let counter = 0;

  const key = (variantId: string, branchId: string) => `${variantId}::${branchId}`;

  return {
    stockMovement: {
      create: async ({ data }: any) => {
        movements.push(data);
        return { id: `mv_${counter++}`, ...data };
      },
    },
    stockLevel: {
      findUnique: async ({ where }: any) => {
        const k = key(where.variantId_branchId.variantId, where.variantId_branchId.branchId);
        return stockLevels.get(k) ?? null;
      },
      findUniqueOrThrow: async ({ where }: any) => {
        const k = key(where.variantId_branchId.variantId, where.variantId_branchId.branchId);
        const row = stockLevels.get(k);
        if (!row) throw new Error('Not found');
        return row;
      },
      create: async ({ data }: any) => {
        const k = key(data.variantId, data.branchId);
        const row = { id: `sl_${counter++}`, ...data };
        stockLevels.set(k, row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const k = key(where.variantId_branchId.variantId, where.variantId_branchId.branchId);
        const row = stockLevels.get(k)!;
        row.quantity += data.quantity.increment;
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        const k = key(where.variantId, where.branchId);
        const row = stockLevels.get(k);
        // Mirrors the real WHERE quantity >= :gte guard from the service.
        if (!row || row.quantity < where.quantity.gte) {
          return { count: 0 };
        }
        row.quantity += data.quantity.increment;
        return { count: 1 };
      },
    },
    // exposed for assertions
    __debug: { stockLevels, movements },
  };
}

describe('applyStockMovement (inventory business logic)', () => {
  let client: ReturnType<typeof createFakePrismaClient>;

  beforeEach(() => {
    client = createFakePrismaClient();
  });

  test('PURCHASE_IN creates a new stock level when none exists', async () => {
    const result = await applyStockMovement(client as any, {
      tenantId: 't1',
      variantId: 'v1',
      branchId: 'b-cairo',
      type: 'PURCHASE_IN',
      quantity: 10,
    });
    assert.equal(result.quantity, 10);
  });

  test('SALE_OUT decrements stock correctly', async () => {
    await applyStockMovement(client as any, { tenantId: 't1', variantId: 'v1', branchId: 'b-cairo', type: 'PURCHASE_IN', quantity: 10 });
    const result = await applyStockMovement(client as any, { tenantId: 't1', variantId: 'v1', branchId: 'b-cairo', type: 'SALE_OUT', quantity: 1 });
    assert.equal(result.quantity, 9);
  });

  test('shared inventory: a sale from branch Cairo is visible when reading stock for the same variant', async () => {
    // Nike Air Max, Black, 42 — stock 10 at Cairo branch.
    await applyStockMovement(client as any, { tenantId: 't1', variantId: 'nike-42-black', branchId: 'b-cairo', type: 'PURCHASE_IN', quantity: 10 });
    await applyStockMovement(client as any, { tenantId: 't1', variantId: 'nike-42-black', branchId: 'b-cairo', type: 'SALE_OUT', quantity: 1 });

    const level = client.__debug.stockLevels.get('nike-42-black::b-cairo');
    assert.equal(level?.quantity, 9, 'Stock must read 9 after the Cairo branch sells 1 of 10');
  });

  test('SALE_OUT refuses to oversell: throws CONFLICT when requested quantity exceeds available stock', async () => {
    await applyStockMovement(client as any, { tenantId: 't1', variantId: 'v1', branchId: 'b-cairo', type: 'PURCHASE_IN', quantity: 3 });

    await assert.rejects(
      () => applyStockMovement(client as any, { tenantId: 't1', variantId: 'v1', branchId: 'b-cairo', type: 'SALE_OUT', quantity: 5 }),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, 'CONFLICT');
        return true;
      },
    );

    // Stock must remain unchanged after the rejected sale.
    const level = client.__debug.stockLevels.get('v1::b-cairo');
    assert.equal(level?.quantity, 3);
  });

  test('branches have independent stock buckets for the same variant', async () => {
    await applyStockMovement(client as any, { tenantId: 't1', variantId: 'v1', branchId: 'b-cairo', type: 'PURCHASE_IN', quantity: 10 });
    await applyStockMovement(client as any, { tenantId: 't1', variantId: 'v1', branchId: 'b-alex', type: 'PURCHASE_IN', quantity: 5 });

    assert.equal(client.__debug.stockLevels.get('v1::b-cairo')?.quantity, 10);
    assert.equal(client.__debug.stockLevels.get('v1::b-alex')?.quantity, 5);
  });

  test('TRANSFER_OUT then TRANSFER_IN moves stock between branches without net loss', async () => {
    await applyStockMovement(client as any, { tenantId: 't1', variantId: 'v1', branchId: 'b-cairo', type: 'PURCHASE_IN', quantity: 10 });
    await applyStockMovement(client as any, { tenantId: 't1', variantId: 'v1', branchId: 'b-cairo', type: 'TRANSFER_OUT', quantity: 4 });
    await applyStockMovement(client as any, { tenantId: 't1', variantId: 'v1', branchId: 'b-alex', type: 'TRANSFER_IN', quantity: 4 });

    assert.equal(client.__debug.stockLevels.get('v1::b-cairo')?.quantity, 6);
    assert.equal(client.__debug.stockLevels.get('v1::b-alex')?.quantity, 4);
  });

  test('rejects a zero or negative movement quantity', async () => {
    await assert.rejects(() =>
      applyStockMovement(client as any, { tenantId: 't1', variantId: 'v1', branchId: 'b-cairo', type: 'PURCHASE_IN', quantity: 0 }),
    );
  });
});
