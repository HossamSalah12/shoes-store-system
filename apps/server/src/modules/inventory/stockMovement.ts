import type { Prisma, PrismaClient } from '@prisma/client';
import { AppError } from '../../utils/AppError';
import type { StockMovementType } from '@shoes/shared';

// This file deliberately has ZERO runtime dependency on the Prisma client
// singleton (../../lib/prisma) — it only uses Prisma's *types* (erased at
// compile time). That keeps `applyStockMovement` a pure, dependency-injected
// function: callers always pass in a client (either the shared `prisma`
// singleton or a `Prisma.TransactionClient`), which is what makes it
// possible to unit-test this function's business logic against a
// lightweight in-memory fake client with zero setup — see
// tests/unit/inventory.test.ts.

export type TxClient = Prisma.TransactionClient | PrismaClient;

/**
 * Applies a single stock movement atomically: writes the append-only
 * StockMovement row AND updates (or creates) the corresponding StockLevel
 * cache row, in one DB transaction. This is the ONLY function in the entire
 * codebase that is allowed to mutate StockLevel — every other module
 * (sales, purchases, returns, transfers, manual adjustments) must call
 * through here so stock math stays centralized and auditable.
 *
 * Concurrency safety: when `client` is a `Prisma.TransactionClient` passed
 * in by the caller (e.g. the sale-creation flow), this participates in that
 * outer transaction. The `StockLevel.quantity` update uses an atomic
 * `increment`/`decrement` at the database level (not a read-modify-write in
 * JS), so two concurrent sales against the same variant/branch from two
 * different desktop clients cannot race and silently drop one of the
 * decrements — PostgreSQL serializes the two UPDATE statements. For
 * decrements, we additionally re-check for a negative outcome via a
 * conditional update and fail loudly rather than allow negative stock.
 */
export async function applyStockMovement(
  client: TxClient,
  params: {
    tenantId: string;
    variantId: string;
    branchId: string;
    type: StockMovementType;
    quantity: number; // always positive
    reason?: string;
    userId?: string | null;
    referenceId?: string;
    allowNegative?: boolean;
  },
) {
  if (params.quantity <= 0) {
    throw AppError.validation('Stock movement quantity must be positive');
  }

  const isIncrease = ['PURCHASE_IN', 'RETURN_IN', 'ADJUSTMENT_IN', 'TRANSFER_IN'].includes(params.type);
  const delta = isIncrease ? params.quantity : -params.quantity;

  await client.stockMovement.create({
    data: {
      tenantId: params.tenantId,
      variantId: params.variantId,
      branchId: params.branchId,
      type: params.type,
      quantity: params.quantity,
      reason: params.reason,
      userId: params.userId ?? undefined,
      referenceId: params.referenceId,
    },
  });

  const existing = await client.stockLevel.findUnique({
    where: { variantId_branchId: { variantId: params.variantId, branchId: params.branchId } },
  });

  if (!existing) {
    if (delta < 0 && !params.allowNegative) {
      throw AppError.conflict('Insufficient stock for this variant at this branch');
    }
    const created = await client.stockLevel.create({
      data: {
        tenantId: params.tenantId,
        variantId: params.variantId,
        branchId: params.branchId,
        quantity: Math.max(0, delta),
      },
    });
    return created;
  }

  if (delta < 0 && !params.allowNegative) {
    // Atomic conditional decrement: only succeeds if quantity stays >= 0.
    // updateMany + where quantity >= |delta| avoids the classic
    // read-then-write race between two concurrent sales.
    const result = await client.stockLevel.updateMany({
      where: {
        variantId: params.variantId,
        branchId: params.branchId,
        quantity: { gte: -delta },
      },
      data: { quantity: { increment: delta } },
    });
    if (result.count === 0) {
      throw AppError.conflict('Insufficient stock for this variant at this branch');
    }
    return client.stockLevel.findUniqueOrThrow({
      where: { variantId_branchId: { variantId: params.variantId, branchId: params.branchId } },
    });
  }

  return client.stockLevel.update({
    where: { variantId_branchId: { variantId: params.variantId, branchId: params.branchId } },
    data: { quantity: { increment: delta } },
  });
}
