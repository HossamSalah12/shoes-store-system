import { Router } from 'express';
import { createBranchSchema, updateBranchSchema } from '@shoes/validation';
import { PERMISSIONS } from '@shoes/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireTenantUser } from '../../middleware/authorize';
import { validate } from '../../middleware/security';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok, created, noContent } from '../../utils/apiResponse';
import * as branchService from './branch.service';

export const branchRouter = Router();

branchRouter.use(authenticate, requireTenantUser);

branchRouter.get(
  '/',
  requirePermission(PERMISSIONS.BRANCH_VIEW),
  asyncHandler(async (req, res) => {
    const branches = await branchService.listBranches(req.authContext!.tenantId!);
    return ok(res, branches);
  }),
);

branchRouter.get(
  '/:branchId',
  requirePermission(PERMISSIONS.BRANCH_VIEW),
  asyncHandler(async (req, res) => {
    const branch = await branchService.getBranch(req.authContext!.tenantId!, req.params.branchId);
    return ok(res, branch);
  }),
);

branchRouter.post(
  '/',
  requirePermission(PERMISSIONS.BRANCH_CREATE),
  validate(createBranchSchema),
  asyncHandler(async (req, res) => {
    const branch = await branchService.createBranch(req.authContext!.tenantId!, req.body, req.authContext!.userId);
    return created(res, branch);
  }),
);

branchRouter.patch(
  '/:branchId',
  requirePermission(PERMISSIONS.BRANCH_UPDATE),
  validate(updateBranchSchema),
  asyncHandler(async (req, res) => {
    const branch = await branchService.updateBranch(
      req.authContext!.tenantId!,
      req.params.branchId,
      req.body,
      req.authContext!.userId,
    );
    return ok(res, branch);
  }),
);

branchRouter.delete(
  '/:branchId',
  requirePermission(PERMISSIONS.BRANCH_DELETE),
  asyncHandler(async (req, res) => {
    const result = await branchService.deleteBranch(req.authContext!.tenantId!, req.params.branchId, req.authContext!.userId);
    if (!result) return noContent(res);
    return ok(res, result);
  }),
);
