import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { PERMISSIONS } from '@shoes/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireTenantUser } from '../../middleware/authorize';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/apiResponse';

export const tenantSubscriptionRouter = Router();
tenantSubscriptionRouter.use(authenticate, requireTenantUser);

/**
 * Read-only view of the CALLER'S OWN tenant subscription history. Unlike
 * /api/platform/subscriptions (Super Admin only, any tenant), this route
 * takes tenantId exclusively from req.authContext, so it is architecturally
 * impossible for it to return another tenant's billing data regardless of
 * what a client sends.
 */
tenantSubscriptionRouter.get(
  '/',
  requirePermission(PERMISSIONS.SUBSCRIPTION_VIEW),
  asyncHandler(async (req, res) => {
    const subscriptions = await prisma.subscription.findMany({
      where: { tenantId: req.authContext!.tenantId! },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
    return ok(res, subscriptions);
  }),
);
