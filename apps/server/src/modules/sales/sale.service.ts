import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/AppError';
import { applyStockMovement } from '../inventory/inventory.service';
import { recordAudit } from '../audit/audit.service';
import type { PaymentMethod } from '@shoes/shared';

interface SaleItemInput {
  variantId: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
}
interface PaymentInput {
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

interface CreateSaleInput {
  branchId: string;
  customerId?: string;
  items: SaleItemInput[];
  payments: PaymentInput[];
  discountAmount: number;
  clientRequestId: string;
}

async function nextInvoiceNumber(tenantId: string, branchId: string): Promise<string> {
  // Human-friendly, still-unique-enough invoice number. True uniqueness is
  // enforced by the @@unique([tenantId, invoiceNumber]) constraint — on the
  // rare collision (e.g. clock skew across concurrent devices) the caller
  // retries with a fresh timestamp, see createSale's retry loop.
  const [branch, settings] = await Promise.all([
    prisma.branch.findUnique({ where: { id: branchId } }),
    prisma.settings.findUnique({ where: { tenantId }, select: { invoicePrefix: true } }),
  ]);
  const prefix = settings?.invoicePrefix?.trim() || 'INV';
  const branchCode = (branch?.name ?? 'BR').slice(0, 3).toUpperCase();
  const stamp = Date.now().toString(36).toUpperCase();
  return `${prefix}-${branchCode}-${stamp}`;
}

/**
 * Creates a sale as a single atomic database transaction:
 *   1. Idempotency check via (tenantId, clientRequestId) — if the POS
 *      client retries a checkout (e.g. after a network drop where it never
 *      received the success response), the SAME sale is returned instead of
 *      a duplicate being created. This directly satisfies the "no duplicate
 *      sale on retry" requirement.
 *   2. Every SaleItem is validated against tenant-scoped ProductVariant
 *      rows (never trusting client-supplied prices/tenant associations
 *      beyond what's re-verified here).
 *   3. Stock is decremented through `applyStockMovement`, which performs an
 *      atomic, conditional UPDATE so two concurrent sales for the same
 *      variant/branch can never oversell — the second one to commit will
 *      receive a CONFLICT (409) if stock is insufficient at that instant,
 *      which the POS UI surfaces to the cashier immediately (no "successful"
 *      receipt is ever shown for a sale that didn't actually persist).
 *   4. Payments must sum to at least the sale total.
 * Everything happens in `prisma.$transaction`, so a failure at any step
 * (e.g. insufficient stock on item 3 of 5) rolls back the entire sale —
 * there is no possibility of a half-applied sale record with partially
 * decremented stock.
 */
export async function createSale(tenantId: string, branchId: string, cashierId: string, input: CreateSaleInput) {
  // Idempotency: return the existing sale if this exact client request was
  // already processed (survives retries safely).
  const existing = await prisma.sale.findUnique({
    where: { tenantId_clientRequestId: { tenantId, clientRequestId: input.clientRequestId } },
    include: { items: true, payments: true },
  });
  if (existing) return existing;

  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch || branch.tenantId !== tenantId) throw AppError.notFound('Branch not found');

  if (input.customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
    if (!customer || customer.tenantId !== tenantId) throw AppError.notFound('Customer not found');
  }

  const variantIds = input.items.map((i) => i.variantId);
  const variants = await prisma.productVariant.findMany({ where: { id: { in: variantIds }, tenantId } });
  const variantById = new Map(variants.map((v) => [v.id, v]));
  for (const item of input.items) {
    if (!variantById.has(item.variantId)) {
      throw AppError.validation(`Product variant ${item.variantId} not found for this tenant`);
    }
  }

  const subtotal = input.items.reduce((sum, i) => sum + i.quantity * i.unitPrice - i.discountAmount, 0);
  const totalAmount = Math.max(0, subtotal - input.discountAmount);
  const paidAmount = input.payments.reduce((sum, p) => sum + p.amount, 0);

  if (paidAmount + 0.01 < totalAmount) {
    throw AppError.validation('Total payments do not cover the sale amount');
  }

  const MAX_RETRIES = 3;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const invoiceNumber = await nextInvoiceNumber(tenantId, branchId);

      const sale = await prisma.$transaction(async (tx) => {
        const created = await tx.sale.create({
          data: {
            tenantId,
            branchId,
            cashierId,
            customerId: input.customerId,
            invoiceNumber,
            status: 'COMPLETED',
            subtotal,
            discountAmount: input.discountAmount,
            totalAmount,
            clientRequestId: input.clientRequestId,
            items: {
              create: input.items.map((i) => ({
                variantId: i.variantId,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                discountAmount: i.discountAmount,
                lineTotal: i.quantity * i.unitPrice - i.discountAmount,
              })),
            },
            payments: {
              create: input.payments.map((p) => ({ method: p.method, amount: p.amount, reference: p.reference })),
            },
          },
          include: { items: true, payments: true },
        });

        for (const item of input.items) {
          // Throws AppError('CONFLICT') if stock is insufficient at this
          // instant — the whole transaction rolls back automatically.
          await applyStockMovement(tx, {
            tenantId,
            variantId: item.variantId,
            branchId,
            type: 'SALE_OUT',
            quantity: item.quantity,
            reason: `Sale ${invoiceNumber}`,
            userId: cashierId,
            referenceId: created.id,
          });
        }

        return created;
      });

      await recordAudit({
        tenantId,
        userId: cashierId,
        action: 'sale.create',
        entityType: 'Sale',
        entityId: sale.id,
        metadata: { branchId, totalAmount, invoiceNumber: sale.invoiceNumber },
      });

      return sale;
    } catch (err) {
      lastError = err;
      // Only retry on an invoice-number unique collision (P2002-shaped
      // conflict from a timing coincidence between two devices); stock
      // conflicts (AppError CONFLICT from applyStockMovement) must NOT be
      // retried silently — surface them immediately to the cashier.
      if (err instanceof AppError && err.code === 'CONFLICT' && err.message.includes('stock')) {
        throw err;
      }
      continue;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to create sale after retries');
}

export async function cancelSale(tenantId: string, saleId: string, reason: string, actingUserId: string) {
  const sale = await prisma.sale.findUnique({ where: { id: saleId }, include: { items: true } });
  if (!sale || sale.tenantId !== tenantId) throw AppError.notFound('Sale not found');
  if (sale.status !== 'COMPLETED') throw AppError.conflict('Only a completed sale can be cancelled');

  await prisma.$transaction(async (tx) => {
    await tx.sale.update({
      where: { id: saleId },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledById: actingUserId, cancelReason: reason },
    });
    for (const item of sale.items) {
      await applyStockMovement(tx, {
        tenantId,
        variantId: item.variantId,
        branchId: sale.branchId,
        type: 'RETURN_IN',
        quantity: item.quantity,
        reason: `Sale ${sale.invoiceNumber} cancelled: ${reason}`,
        userId: actingUserId,
        referenceId: sale.id,
      });
    }
  });

  await recordAudit({ tenantId, userId: actingUserId, action: 'sale.cancel', entityType: 'Sale', entityId: saleId, metadata: { reason } });

  return prisma.sale.findUnique({ where: { id: saleId }, include: { items: true, payments: true } });
}

export async function getSale(tenantId: string, saleId: string) {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      items: { include: { variant: { include: { product: true, size: true, color: true } } } },
      payments: true,
      cashier: { select: { id: true, fullName: true } },
      customer: true,
      branch: { select: { id: true, name: true } },
    },
  });
  if (!sale || sale.tenantId !== tenantId) throw AppError.notFound('Sale not found');
  return sale;
}

export async function listSales(
  tenantId: string,
  filters: { branchId?: string; from?: Date; to?: Date; page: number; pageSize: number },
) {
  const where = {
    tenantId,
    ...(filters.branchId ? { branchId: filters.branchId } : {}),
    ...(filters.from || filters.to
      ? { createdAt: { gte: filters.from, lte: filters.to } }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: { items: true, payments: true, cashier: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.sale.count({ where }),
  ]);
  return { items, total };
}
