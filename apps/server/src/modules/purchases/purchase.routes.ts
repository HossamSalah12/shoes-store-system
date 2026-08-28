import { Router } from 'express';
import { z } from 'zod';
import { createPurchaseSchema } from '@shoes/validation';
import { PERMISSIONS } from '@shoes/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireTenantUser } from '../../middleware/authorize';
import { requireBranchAccess } from '../../middleware/branchAccess';
import { validate } from '../../middleware/security';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok, created, paginated } from '../../utils/apiResponse';
import * as purchaseService from './purchase.service';

export const purchaseRouter = Router();
purchaseRouter.use(authenticate, requireTenantUser);

const listQuery = z.object({
  query: z.object({
    branchId: z.string().cuid().optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(200).default(25),
  }),
});

purchaseRouter.get(
  '/',
  requirePermission(PERMISSIONS.PURCHASE_VIEW),
  validate(listQuery),
  asyncHandler(async (req, res) => {
    const { branchId, page, pageSize } = req.query as any;
    const { items, total } = await purchaseService.listPurchases(req.authContext!.tenantId!, branchId, page, pageSize);
    return paginated(res, items, total, page, pageSize);
  }),
);

purchaseRouter.post(
  '/',
  requirePermission(PERMISSIONS.PURCHASE_CREATE),
  validate(createPurchaseSchema),
  requireBranchAccess('body', 'branchId'),
  asyncHandler(async (req, res) => {
    const purchase = await purchaseService.createPurchase(req.authContext!.tenantId!, req.body, req.authContext!.userId);
    return created(res, purchase);
  }),
);
