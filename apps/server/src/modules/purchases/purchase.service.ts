import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/AppError';
import { applyStockMovement } from '../inventory/inventory.service';
import { recordAudit } from '../audit/audit.service';

interface PurchaseItemInput {
  variantId: string;
  quantity: number;
  unitCost: number;
}

export async function createPurchase(
  tenantId: string,
  data: { branchId: string; supplierId: string; items: PurchaseItemInput[]; notes?: string },
  actingUserId: string,
) {
  const [branch, supplier] = await Promise.all([
    prisma.branch.findUnique({ where: { id: data.branchId } }),
    prisma.supplier.findUnique({ where: { id: data.supplierId } }),
  ]);
  if (!branch || branch.tenantId !== tenantId) throw AppError.notFound('Branch not found');
  if (!supplier || supplier.tenantId !== tenantId) throw AppError.notFound('Supplier not found');

  const variantIds = data.items.map((i) => i.variantId);
  const variants = await prisma.productVariant.findMany({ where: { id: { in: variantIds }, tenantId } });
  if (variants.length !== new Set(variantIds).size) {
    throw AppError.validation('One or more product variants are invalid for this tenant');
  }

  const totalCost = data.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);

  const purchase = await prisma.$transaction(async (tx) => {
    const created = await tx.purchase.create({
      data: {
        tenantId,
        branchId: data.branchId,
        supplierId: data.supplierId,
        status: 'RECEIVED',
        totalCost,
        notes: data.notes,
        userId: actingUserId,
        items: {
          create: data.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, unitCost: i.unitCost })),
        },
      },
      include: { items: true },
    });

    for (const item of data.items) {
      await applyStockMovement(tx, {
        tenantId,
        variantId: item.variantId,
        branchId: data.branchId,
        type: 'PURCHASE_IN',
        quantity: item.quantity,
        reason: `Purchase #${created.id}`,
        userId: actingUserId,
        referenceId: created.id,
      });
    }

    // Receiving goods on a purchase increases what we owe this supplier
    // (accounts payable). Paid immediately or on credit is not currently
    // distinguished by the spec — every purchase increases the balance,
    // and recordSupplierPayment (see supplier.service additions) is how
    // that balance comes back down.
    await tx.supplier.update({ where: { id: data.supplierId }, data: { balance: { increment: totalCost } } });

    return created;
  });

  await recordAudit({ tenantId, userId: actingUserId, action: 'purchase.create', entityType: 'Purchase', entityId: purchase.id, metadata: { totalCost } });

  return purchase;
}

export async function listPurchases(tenantId: string, branchId?: string, page = 1, pageSize = 25) {
  const where = { tenantId, ...(branchId ? { branchId } : {}) };
  const [items, total] = await Promise.all([
    prisma.purchase.findMany({
      where,
      include: { supplier: true, branch: true, items: { include: { variant: { include: { product: true } } } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.purchase.count({ where }),
  ]);
  return { items, total };
}
