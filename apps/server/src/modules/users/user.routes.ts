import { Router } from 'express';
import { createUserSchema, updateUserSchema } from '@shoes/validation';
import { PERMISSIONS } from '@shoes/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireTenantUser } from '../../middleware/authorize';
import { validate } from '../../middleware/security';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok, created } from '../../utils/apiResponse';
import * as userService from './user.service';

export const userRouter = Router();

userRouter.use(authenticate, requireTenantUser);

userRouter.get(
  '/',
  requirePermission(PERMISSIONS.USER_VIEW),
  asyncHandler(async (req, res) => {
    const users = await userService.listUsers(req.authContext!.tenantId!);
    return ok(res, users);
  }),
);

userRouter.get(
  '/:userId',
  requirePermission(PERMISSIONS.USER_VIEW),
  asyncHandler(async (req, res) => {
    const user = await userService.getUser(req.authContext!.tenantId!, req.params.userId);
    return ok(res, user);
  }),
);

userRouter.post(
  '/',
  requirePermission(PERMISSIONS.USER_CREATE),
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    const user = await userService.createUser(req.authContext!.tenantId!, req.body, req.authContext!.userId);
    return created(res, user);
  }),
);

userRouter.patch(
  '/:userId',
  requirePermission(PERMISSIONS.USER_UPDATE),
  validate(updateUserSchema),
  asyncHandler(async (req, res) => {
    const user = await userService.updateUser(
      req.authContext!.tenantId!,
      req.params.userId,
      req.body,
      req.authContext!.userId,
    );
    return ok(res, user);
  }),
);

userRouter.post(
  '/:userId/deactivate',
  requirePermission(PERMISSIONS.USER_DELETE),
  asyncHandler(async (req, res) => {
    const user = await userService.deactivateUser(req.authContext!.tenantId!, req.params.userId, req.authContext!.userId);
    return ok(res, user);
  }),
);
