import { Router } from 'express';
import { createRoleSchema, updateRolePermissionsSchema } from '@shoes/validation';
import { PERMISSIONS } from '@shoes/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireTenantUser } from '../../middleware/authorize';
import { validate } from '../../middleware/security';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok, created, noContent } from '../../utils/apiResponse';
import * as roleService from './role.service';

export const roleRouter = Router();

roleRouter.use(authenticate, requireTenantUser);

roleRouter.get(
  '/',
  requirePermission(PERMISSIONS.ROLE_MANAGE, PERMISSIONS.USER_VIEW),
  asyncHandler(async (req, res) => {
    const roles = await roleService.listRoles(req.authContext!.tenantId!);
    return ok(res, roles);
  }),
);

roleRouter.get(
  '/permissions',
  requirePermission(PERMISSIONS.ROLE_MANAGE),
  asyncHandler(async (_req, res) => {
    const permissions = await roleService.listAllPermissions();
    return ok(res, permissions);
  }),
);

roleRouter.post(
  '/',
  requirePermission(PERMISSIONS.ROLE_MANAGE),
  validate(createRoleSchema),
  asyncHandler(async (req, res) => {
    const role = await roleService.createCustomRole(req.authContext!.tenantId!, req.body.name, req.body.permissions, req.authContext!.userId);
    return created(res, role);
  }),
);

roleRouter.patch(
  '/:roleId/permissions',
  requirePermission(PERMISSIONS.ROLE_MANAGE),
  validate(updateRolePermissionsSchema),
  asyncHandler(async (req, res) => {
    const role = await roleService.updateRolePermissions(
      req.authContext!.tenantId!,
      req.params.roleId,
      req.body.permissions,
      req.authContext!.userId,
    );
    return ok(res, role);
  }),
);

roleRouter.delete(
  '/:roleId',
  requirePermission(PERMISSIONS.ROLE_MANAGE),
  asyncHandler(async (req, res) => {
    await roleService.deleteCustomRole(req.authContext!.tenantId!, req.params.roleId, req.authContext!.userId);
    return noContent(res);
  }),
);
