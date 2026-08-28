import { Router } from 'express';
import { PERMISSIONS } from '@shoes/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireTenantUser } from '../../middleware/authorize';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/apiResponse';
import * as reportService from './report.service';

export const reportRouter = Router();
reportRouter.use(authenticate, requireTenantUser);

reportRouter.get(
  '/dashboard',
  requirePermission(PERMISSIONS.REPORT_VIEW_BRANCH, PERMISSIONS.REPORT_VIEW_TENANT),
  asyncHandler(async (req, res) => {
    const dashboard = await reportService.getDashboard(req.authContext!);
    return ok(res, dashboard);
  }),
);

reportRouter.get(
  '/best-sizes-colors',
  requirePermission(PERMISSIONS.REPORT_VIEW_BRANCH, PERMISSIONS.REPORT_VIEW_TENANT),
  asyncHandler(async (req, res) => {
    const ctx = req.authContext!;
    const isOwner = ctx.roleCodes.includes('OWNER');
    const branchFilter = isOwner ? {} : { branchId: { in: ctx.branchIds } };
    const result = await reportService.getBestSizesAndColors(ctx.tenantId!, branchFilter);
    return ok(res, result);
  }),
);
