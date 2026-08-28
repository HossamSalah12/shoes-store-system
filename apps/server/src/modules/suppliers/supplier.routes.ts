import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/AppError';
import { assertTenantOwnership } from '../../lib/tenantGuard';
import { recordAudit } from '../audit/audit.service';
import { createSupplierSchema, recordSupplierPaymentSchema } from '@shoes/validation';
import { PERMISSIONS } from '@shoes/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireTenantUser } from '../../middleware/authorize';
import { validate } from '../../middleware/security';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok, created } from '../../utils/apiResponse';

// --- service ---
export async function listSuppliers(tenantId: string) {
  return prisma.supplier.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
}
export async function getSupplier(tenantId: string, supplierId: string) {
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  return assertTenantOwnership(supplier, tenantId, 'Supplier not found');
}
export async function createSupplier(tenantId: string, data: { name: string; phone?: string; email?: string; address?: string; notes?: string }, actingUserId: string) {
  const supplier = await prisma.supplier.create({ data: { tenantId, ...data } });
  await recordAudit({ tenantId, userId: actingUserId, action: 'supplier.create', entityType: 'Supplier', entityId: supplier.id });
  return supplier;
}
export async function updateSupplier(tenantId: string, supplierId: string, data: Partial<{ name: string; phone: string; email: string; address: string; notes: string }>, actingUserId: string) {
  await getSupplier(tenantId, supplierId);
  const supplier = await prisma.supplier.update({ where: { id: supplierId }, data });
  await recordAudit({ tenantId, userId: actingUserId, action: 'supplier.update', entityType: 'Supplier', entityId: supplierId });
  return supplier;
}

/**
 * Records a payment made TO a supplier and atomically decrements their
 * balance by the same amount, exactly mirroring how a Purchase increments
 * it. SupplierPayment is append-only (never edited/deleted) so the
 * balance always reconciles against a real, auditable trail — the same
 * design already used for inventory (StockMovement -> StockLevel).
 */
export async function recordSupplierPayment(
  tenantId: string,
  supplierId: string,
  data: { amount: number; method?: string; reference?: string; notes?: string },
  actingUserId: string,
) {
  const supplier = await getSupplier(tenantId, supplierId); // ownership check

  if (data.amount > Number(supplier.balance)) {
    throw AppError.validation('Payment amount exceeds the current outstanding balance');
  }

  const payment = await prisma.$transaction(async (tx) => {
    const createdPayment = await tx.supplierPayment.create({
      data: {
        tenantId,
        supplierId,
        amount: data.amount,
        method: data.method,
        reference: data.reference,
        notes: data.notes,
        userId: actingUserId,
      },
    });
    await tx.supplier.update({ where: { id: supplierId }, data: { balance: { decrement: data.amount } } });
    return createdPayment;
  });

  await recordAudit({
    tenantId,
    userId: actingUserId,
    action: 'supplier.payment',
    entityType: 'SupplierPayment',
    entityId: payment.id,
    metadata: { supplierId, amount: data.amount },
  });

  return payment;
}

export async function listSupplierPayments(tenantId: string, supplierId: string) {
  await getSupplier(tenantId, supplierId); // ownership check
  return prisma.supplierPayment.findMany({ where: { tenantId, supplierId }, orderBy: { createdAt: 'desc' } });
}

// --- routes ---
export const supplierRouter = Router();
supplierRouter.use(authenticate, requireTenantUser);

supplierRouter.get('/', requirePermission(PERMISSIONS.SUPPLIER_VIEW), asyncHandler(async (req, res) => ok(res, await listSuppliers(req.authContext!.tenantId!))));
supplierRouter.get('/:supplierId', requirePermission(PERMISSIONS.SUPPLIER_VIEW), asyncHandler(async (req, res) => ok(res, await getSupplier(req.authContext!.tenantId!, req.params.supplierId))));
supplierRouter.post('/', requirePermission(PERMISSIONS.SUPPLIER_MANAGE), validate(createSupplierSchema), asyncHandler(async (req, res) => created(res, await createSupplier(req.authContext!.tenantId!, req.body, req.authContext!.userId))));
supplierRouter.patch('/:supplierId', requirePermission(PERMISSIONS.SUPPLIER_MANAGE), asyncHandler(async (req, res) => ok(res, await updateSupplier(req.authContext!.tenantId!, req.params.supplierId, req.body, req.authContext!.userId))));

supplierRouter.get(
  '/:supplierId/payments',
  requirePermission(PERMISSIONS.SUPPLIER_VIEW),
  asyncHandler(async (req, res) => ok(res, await listSupplierPayments(req.authContext!.tenantId!, req.params.supplierId))),
);
supplierRouter.post(
  '/:supplierId/payments',
  requirePermission(PERMISSIONS.SUPPLIER_MANAGE),
  validate(recordSupplierPaymentSchema),
  asyncHandler(async (req, res) =>
    created(res, await recordSupplierPayment(req.authContext!.tenantId!, req.params.supplierId, req.body, req.authContext!.userId)),
  ),
);
