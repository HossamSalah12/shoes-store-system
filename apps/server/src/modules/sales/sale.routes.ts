import { Router } from 'express';
import { createSaleSchema, cancelSaleSchema, listSalesQuerySchema } from '@shoes/validation';
import { PERMISSIONS, SOCKET_EVENTS } from '@shoes/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireTenantUser } from '../../middleware/authorize';
import { requireBranchAccess } from '../../middleware/branchAccess';
import { validate } from '../../middleware/security';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok, created, paginated } from '../../utils/apiResponse';
import * as saleService from './sale.service';
import { getIo } from '../../realtime/socket';

export const saleRouter = Router();
saleRouter.use(authenticate, requireTenantUser);

saleRouter.get(
  '/',
  requirePermission(PERMISSIONS.SALE_VIEW),
  validate(listSalesQuerySchema),
  asyncHandler(async (req, res) => {
    const { branchId, from, to, page, pageSize } = req.query as any;
    const { items, total } = await saleService.listSales(req.authContext!.tenantId!, { branchId, from, to, page, pageSize });
    return paginated(res, items, total, page, pageSize);
  }),
);

saleRouter.get(
  '/:saleId',
  requirePermission(PERMISSIONS.SALE_VIEW),
  asyncHandler(async (req, res) => {
    const sale = await saleService.getSale(req.authContext!.tenantId!, req.params.saleId);
    return ok(res, sale);
  }),
);

saleRouter.post(
  '/',
  requirePermission(PERMISSIONS.SALE_CREATE),
  validate(createSaleSchema),
  requireBranchAccess('body', 'branchId'),
  asyncHandler(async (req, res) => {
    const ctx = req.authContext!;

    // Discounts beyond zero require an explicit permission — a Cashier
    // without SALE_DISCOUNT cannot silently apply one even if the POS UI
    // sent a non-zero discountAmount (defense in depth: the frontend also
    // hides the control, but the backend is authoritative).
    const hasLineDiscount = req.body.items.some((i: { discountAmount: number }) => i.discountAmount > 0);
    if ((req.body.discountAmount > 0 || hasLineDiscount) && !ctx.permissions.includes(PERMISSIONS.SALE_DISCOUNT)) {
      req.body.discountAmount = 0;
      req.body.items = req.body.items.map((i: any) => ({ ...i, discountAmount: 0 }));
    }

    const sale = await saleService.createSale(ctx.tenantId!, req.body.branchId, ctx.userId, req.body);

    getIo()?.to(`tenant:${ctx.tenantId}`).emit(SOCKET_EVENTS.SALE_CREATED, {
      saleId: sale.id,
      branchId: req.body.branchId,
      invoiceNumber: sale.invoiceNumber,
    });
    getIo()?.to(`tenant:${ctx.tenantId}`).emit(SOCKET_EVENTS.STOCK_UPDATED, { branchId: req.body.branchId });

    return created(res, sale);
  }),
);

saleRouter.post(
  '/:saleId/cancel',
  requirePermission(PERMISSIONS.SALE_CANCEL),
  validate(cancelSaleSchema),
  asyncHandler(async (req, res) => {
    const ctx = req.authContext!;
    const sale = await saleService.cancelSale(ctx.tenantId!, req.params.saleId, req.body.reason, ctx.userId);
    getIo()?.to(`tenant:${ctx.tenantId}`).emit(SOCKET_EVENTS.SALE_CANCELLED, { saleId: req.params.saleId });
    return ok(res, sale);
  }),
);
