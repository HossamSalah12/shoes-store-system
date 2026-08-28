import { Router } from 'express';
import { z } from 'zod';
import { stockAdjustmentSchema, stockTransferSchema, lowStockQuerySchema } from '@shoes/validation';
import { PERMISSIONS } from '@shoes/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireTenantUser } from '../../middleware/authorize';
import { requireBranchAccess } from '../../middleware/branchAccess';
import { validate } from '../../middleware/security';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok, created, paginated } from '../../utils/apiResponse';
import * as inventoryService from './inventory.service';
import { getIo } from '../../realtime/socket';
import { SOCKET_EVENTS } from '@shoes/shared';

export const inventoryRouter = Router();

inventoryRouter.use(authenticate, requireTenantUser);

const listMovementsQuery = z.object({
  query: z.object({
    variantId: z.string().cuid().optional(),
    branchId: z.string().cuid().optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(200).default(25),
  }),
});

inventoryRouter.get(
  '/movements',
  requirePermission(PERMISSIONS.INVENTORY_VIEW),
  validate(listMovementsQuery),
  asyncHandler(async (req, res) => {
    const { variantId, branchId, page, pageSize } = req.query as any;
    const { items, total } = await inventoryService.listStockMovements(req.authContext!.tenantId!, { variantId, branchId, page, pageSize });
    return paginated(res, items, total, page, pageSize);
  }),
);

inventoryRouter.get(
  '/variant/:variantId',
  requirePermission(PERMISSIONS.INVENTORY_VIEW),
  asyncHandler(async (req, res) => {
    const stock = await inventoryService.getStockForVariant(req.authContext!.tenantId!, req.params.variantId);
    return ok(res, stock);
  }),
);

inventoryRouter.get(
  '/branch/:branchId',
  requirePermission(PERMISSIONS.INVENTORY_VIEW),
  asyncHandler(async (req, res) => {
    const stock = await inventoryService.listStockByBranch(req.authContext!.tenantId!, req.params.branchId);
    return ok(res, stock);
  }),
);

inventoryRouter.get(
  '/low-stock',
  requirePermission(PERMISSIONS.INVENTORY_VIEW),
  validate(lowStockQuerySchema),
  asyncHandler(async (req, res) => {
    const { threshold, branchId } = req.query as any;
    const stock = await inventoryService.listLowStock(req.authContext!.tenantId!, threshold, branchId);
    return ok(res, stock);
  }),
);

inventoryRouter.post(
  '/adjust',
  requirePermission(PERMISSIONS.INVENTORY_ADJUST),
  validate(stockAdjustmentSchema),
  requireBranchAccess('body', 'branchId'),
  asyncHandler(async (req, res) => {
    const result = await inventoryService.adjustStock(req.authContext!.tenantId!, req.body, req.authContext!.userId);
    getIo()?.to(`tenant:${req.authContext!.tenantId}`).emit(SOCKET_EVENTS.STOCK_UPDATED, {
      variantId: req.body.variantId,
      branchId: req.body.branchId,
    });
    return ok(res, result);
  }),
);

inventoryRouter.post(
  '/transfer',
  requirePermission(PERMISSIONS.INVENTORY_TRANSFER),
  validate(stockTransferSchema),
  asyncHandler(async (req, res) => {
    const ctx = req.authContext!;
    // Requires access to BOTH the source and destination branch.
    const { assertBranchAccess } = await import('../../middleware/branchAccess');
    assertBranchAccess(ctx, req.body.fromBranchId);
    assertBranchAccess(ctx, req.body.toBranchId);

    const result = await inventoryService.transferStock(ctx.tenantId!, req.body, ctx.userId);
    getIo()?.to(`tenant:${ctx.tenantId}`).emit(SOCKET_EVENTS.STOCK_UPDATED, {
      variantId: req.body.variantId,
      branchId: req.body.fromBranchId,
    });
    getIo()?.to(`tenant:${ctx.tenantId}`).emit(SOCKET_EVENTS.STOCK_UPDATED, {
      variantId: req.body.variantId,
      branchId: req.body.toBranchId,
    });
    return created(res, result);
  }),
);
