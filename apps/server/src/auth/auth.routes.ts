import { Router } from 'express';
import { loginSchema, refreshTokenSchema, changePasswordSchema } from '@shoes/validation';
import { validate, authRateLimiter } from '../middleware/security';
import { authenticate } from '../middleware/authenticate';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/apiResponse';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/AppError';
import * as authService from './auth.service';

export const authRouter = Router();

authRouter.post(
  '/login',
  authRateLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.login({
      email: req.body.email,
      password: req.body.password,
      tenantSlug: req.body.tenantSlug,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return ok(res, result);
  }),
);

authRouter.post(
  '/refresh',
  authRateLimiter,
  validate(refreshTokenSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.refresh(req.body.refreshToken, req.ip);
    return ok(res, result);
  }),
);

authRouter.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    await authService.logout(req.authContext!.sessionId);
    return ok(res, { loggedOut: true });
  }),
);

authRouter.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    await authService.changePassword(req.authContext!.userId, req.body.currentPassword, req.body.newPassword);
    return ok(res, { changed: true });
  }),
);

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const ctx = req.authContext!;
    const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
    if (!user) throw AppError.unauthenticated();

    const tenantName = ctx.tenantId
      ? (await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true } }))?.name
      : undefined;

    const { passwordHash: _omit, ...safeUser } = user;

    // Same shape as the `user` object returned by POST /api/auth/login —
    // the desktop client's authStore treats both as interchangeable.
    return ok(res, {
      ...safeUser,
      permissions: ctx.permissions,
      roles: ctx.roleCodes,
      branchIds: ctx.branchIds,
      tenantName,
    });
  }),
);
