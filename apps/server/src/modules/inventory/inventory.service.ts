import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../audit/audit.service';
import type { StockMovementType } from '@shoes/shared';
import { applyStockMovement } from './stockMovement';

export { applyStockMovement } from './stockMovement';

export async function listStockMovements(
  tenantId: string,
  filters: { variantId?: string; branchId?: string; page: number; pageSize: number },
) {
  const where = {
    tenantId,
    ...(filters.variantId ? { variantId: filters.variantId } : {}),
    ...(filters.branchId ? { branchId: filters.branchId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      include: {
        variant: { include: { product: true, size: true, color: true } },
        branch: { select: { id: true, name: true } },
        user: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.stockMovement.count({ where }),
  ]);
  return { items, total };
}

export async function getStockForVariant(tenantId: string, variantId: string) {
  const levels = await prisma.stockLevel.findMany({
    where: { tenantId, variantId },
    include: { branch: { select: { id: true, name: true } } },
  });
  const total = levels.reduce((sum, l) => sum + l.quantity, 0);
  return { levels, total };
}

export async function listStockByBranch(tenantId: string, branchId: string) {
  return prisma.stockLevel.findMany({
    where: { tenantId, branchId },
    include: { variant: { include: { product: true, size: true, color: true } } },
    orderBy: { quantity: 'asc' },
  });
}

export async function listLowStock(tenantId: string, threshold: number, branchId?: string) {
  return prisma.stockLevel.findMany({
    where: { tenantId, quantity: { lte: threshold }, ...(branchId ? { branchId } : {}) },
    include: { variant: { include: { product: true, size: true, color: true } }, branch: { select: { id: true, name: true } } },
    orderBy: { quantity: 'asc' },
  });
}

export async function adjustStock(
  tenantId: string,
  data: { variantId: string; branchId: string; quantityDelta: number; reason: string },
  actingUserId: string,
) {
  const variant = await prisma.productVariant.findUnique({ where: { id: data.variantId } });
  if (!variant || variant.tenantId !== tenantId) throw AppError.notFound('Product variant not found');
  const branch = await prisma.branch.findUnique({ where: { id: data.branchId } });
  if (!branch || branch.tenantId !== tenantId) throw AppError.notFound('Branch not found');

  const type: StockMovementType = data.quantityDelta > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';

  const result = await prisma.$transaction((tx) =>
    applyStockMovement(tx, {
      tenantId,
      variantId: data.variantId,
      branchId: data.branchId,
      type,
      quantity: Math.abs(data.quantityDelta),
      reason: data.reason,
      userId: actingUserId,
    }),
  );

  await recordAudit({
    tenantId,
    userId: actingUserId,
    action: 'inventory.adjust',
    entityType: 'ProductVariant',
    entityId: data.variantId,
    metadata: { branchId: data.branchId, delta: data.quantityDelta, reason: data.reason },
  });

  return result;
}

export async function transferStock(
  tenantId: string,
  data: { variantId: string; fromBranchId: string; toBranchId: string; quantity: number; notes?: string },
  actingUserId: string,
) {
  if (data.fromBranchId === data.toBranchId) {
    throw AppError.validation('Source and destination branches must be different');
  }
  const [variant, fromBranch, toBranch] = await Promise.all([
    prisma.productVariant.findUnique({ where: { id: data.variantId } }),
    prisma.branch.findUnique({ where: { id: data.fromBranchId } }),
    prisma.branch.findUnique({ where: { id: data.toBranchId } }),
  ]);
  if (!variant || variant.tenantId !== tenantId) throw AppError.notFound('Product variant not found');
  if (!fromBranch || fromBranch.tenantId !== tenantId) throw AppError.notFound('Source branch not found');
  if (!toBranch || toBranch.tenantId !== tenantId) throw AppError.notFound('Destination branch not found');

  const transfer = await prisma.$transaction(async (tx) => {
    await applyStockMovement(tx, {
      tenantId,
      variantId: data.variantId,
      branchId: data.fromBranchId,
      type: 'TRANSFER_OUT',
      quantity: data.quantity,
      reason: data.notes ?? 'Stock transfer',
      userId: actingUserId,
    });
    await applyStockMovement(tx, {
      tenantId,
      variantId: data.variantId,
      branchId: data.toBranchId,
      type: 'TRANSFER_IN',
      quantity: data.quantity,
      reason: data.notes ?? 'Stock transfer',
      userId: actingUserId,
    });
    return tx.stockTransfer.create({
      data: {
        tenantId,
        variantId: data.variantId,
        fromBranchId: data.fromBranchId,
        toBranchId: data.toBranchId,
        quantity: data.quantity,
        notes: data.notes,
        userId: actingUserId,
      },
    });
  });

  await recordAudit({
    tenantId,
    userId: actingUserId,
    action: 'inventory.transfer',
    entityType: 'StockTransfer',
    entityId: transfer.id,
  });

  return transfer;
}
