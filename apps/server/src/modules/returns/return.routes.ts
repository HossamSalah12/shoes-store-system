import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/AppError';
import { applyStockMovement } from '../inventory/inventory.service';
import { recordAudit } from '../audit/audit.service';
import { createReturnSchema } from '@shoes/validation';
import { PERMISSIONS, SOCKET_EVENTS } from '@shoes/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireTenantUser } from '../../middleware/authorize';
import { validate } from '../../middleware/security';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok, created } from '../../utils/apiResponse';
import { getIo } from '../../realtime/socket';

interface ReturnItemInput {
  saleItemId: string;
  quantity: number;
}

export async function createReturn(
  tenantId: string,
  data: { saleId: string; branchId: string; items: ReturnItemInput[]; reason: string },
  actingUserId: string,
) {
  const sale = await prisma.sale.findUnique({ where: { id: data.saleId }, include: { items: true } });
  if (!sale || sale.tenantId !== tenantId) throw AppError.notFound('Sale not found');
  if (sale.status === 'CANCELLED') throw AppError.conflict('Cannot return items from a cancelled sale');

  const saleItemById = new Map(sale.items.map((i) => [i.id, i]));

  // Validate requested quantities against what was actually sold minus what
  // has already been returned (prevents over-returning).
  const alreadyReturned = await prisma.returnItem.groupBy({
    by: ['saleItemId'],
    where: { saleItem: { saleId: sale.id } },
    _sum: { quantity: true },
  });
  const returnedById = new Map(alreadyReturned.map((r) => [r.saleItemId, r._sum.quantity ?? 0]));

  let totalAmount = 0;
  for (const item of data.items) {
    const saleItem = saleItemById.get(item.saleItemId);
    if (!saleItem) throw AppError.validation(`Sale item ${item.saleItemId} does not belong to this sale`);
    const alreadyReturnedQty = returnedById.get(item.saleItemId) ?? 0;
    if (item.quantity + alreadyReturnedQty > saleItem.quantity) {
      throw AppError.validation('Return quantity exceeds quantity sold');
    }
    const unitValue = Number(saleItem.lineTotal) / saleItem.quantity;
    totalAmount += unitValue * item.quantity;
  }

  const returnRow = await prisma.$transaction(async (tx) => {
    const created = await tx.return.create({
      data: {
        tenantId,
        saleId: sale.id,
        branchId: data.branchId,
        reason: data.reason,
        totalAmount,
        userId: actingUserId,
        items: {
          create: data.items.map((i) => {
            const saleItem = saleItemById.get(i.saleItemId)!;
            const unitValue = Number(saleItem.lineTotal) / saleItem.quantity;
            return { saleItemId: i.saleItemId, quantity: i.quantity, amount: unitValue * i.quantity };
          }),
        },
      },
      include: { items: true },
    });

    for (const item of data.items) {
      const saleItem = saleItemById.get(item.saleItemId)!;
      await applyStockMovement(tx, {
        tenantId,
        variantId: saleItem.variantId,
        branchId: data.branchId,
        type: 'RETURN_IN',
        quantity: item.quantity,
        reason: `Return for sale ${sale.invoiceNumber}: ${data.reason}`,
        userId: actingUserId,
        referenceId: created.id,
      });
    }

    // Update sale status to reflect the return.
    const fullyReturned = sale.items.every((si) => {
      const returnedNow = data.items.find((i) => i.saleItemId === si.id)?.quantity ?? 0;
      const priorReturned = returnedById.get(si.id) ?? 0;
      return returnedNow + priorReturned >= si.quantity;
    });
    await tx.sale.update({
      where: { id: sale.id },
      data: { status: fullyReturned ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
    });

    return created;
  });

  await recordAudit({ tenantId, userId: actingUserId, action: 'return.create', entityType: 'Return', entityId: returnRow.id, metadata: { saleId: sale.id, totalAmount } });

  return returnRow;
}

export async function listReturns(tenantId: string, branchId?: string) {
  return prisma.return.findMany({
    where: { tenantId, ...(branchId ? { branchId } : {}) },
    include: { items: true, sale: { select: { id: true, invoiceNumber: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export const returnRouter = Router();
returnRouter.use(authenticate, requireTenantUser);

returnRouter.get('/', requirePermission(PERMISSIONS.RETURN_VIEW), asyncHandler(async (req, res) => {
  const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
  return ok(res, await listReturns(req.authContext!.tenantId!, branchId));
}));

returnRouter.post('/', requirePermission(PERMISSIONS.RETURN_CREATE), validate(createReturnSchema), asyncHandler(async (req, res) => {
  const ctx = req.authContext!;
  const { assertBranchAccess } = await import('../../middleware/branchAccess');
  assertBranchAccess(ctx, req.body.branchId);

  const result = await createReturn(ctx.tenantId!, req.body, ctx.userId);
  getIo()?.to(`tenant:${ctx.tenantId}`).emit(SOCKET_EVENTS.RETURN_CREATED, { returnId: result.id, branchId: req.body.branchId });
  getIo()?.to(`tenant:${ctx.tenantId}`).emit(SOCKET_EVENTS.STOCK_UPDATED, { branchId: req.body.branchId });
  return created(res, result);
}));
