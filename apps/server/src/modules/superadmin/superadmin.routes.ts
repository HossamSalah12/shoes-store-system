import { Router } from 'express';
import { z } from 'zod';
import { createTenantSchema, updateTenantSchema, createPlanSchema, createSubscriptionSchema } from '@shoes/validation';
import { authenticate } from '../../middleware/authenticate';
import { requireSuperAdmin } from '../../middleware/authorize';
import { validate } from '../../middleware/security';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok, created, paginated } from '../../utils/apiResponse';
import * as tenantService from './tenant.service';
import * as subscriptionService from './subscription.service';

export const superAdminRouter = Router();

// Every route below requires a platform-level SUPER_ADMIN account.
superAdminRouter.use(authenticate, requireSuperAdmin);

superAdminRouter.post(
  '/tenants',
  validate(createTenantSchema),
  asyncHandler(async (req, res) => {
    const tenant = await tenantService.createTenant({ ...req.body, actingUserId: req.authContext!.userId });
    return created(res, tenant);
  }),
);

const listTenantsQuery = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(200).default(25),
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  }),
});

superAdminRouter.get(
  '/tenants',
  validate(listTenantsQuery),
  asyncHandler(async (req, res) => {
    const { page, pageSize, status } = req.query as any;
    const { items, total } = await tenantService.listTenants(page, pageSize, status);
    return paginated(res, items, total, page, pageSize);
  }),
);

superAdminRouter.get(
  '/tenants/:tenantId',
  asyncHandler(async (req, res) => {
    const tenant = await tenantService.getTenantDetails(req.params.tenantId);
    return ok(res, tenant);
  }),
);

superAdminRouter.patch(
  '/tenants/:tenantId',
  validate(updateTenantSchema),
  asyncHandler(async (req, res) => {
    const tenant = await tenantService.updateTenant(req.params.tenantId, req.body);
    return ok(res, tenant);
  }),
);

superAdminRouter.post(
  '/tenants/:tenantId/disable',
  asyncHandler(async (req, res) => {
    const tenant = await tenantService.setTenantStatus(req.params.tenantId, 'DISABLED', req.authContext!.userId);
    return ok(res, tenant);
  }),
);

superAdminRouter.post(
  '/tenants/:tenantId/enable',
  asyncHandler(async (req, res) => {
    const tenant = await tenantService.setTenantStatus(req.params.tenantId, 'ACTIVE', req.authContext!.userId);
    return ok(res, tenant);
  }),
);

superAdminRouter.get(
  '/statistics',
  asyncHandler(async (_req, res) => {
    const stats = await tenantService.getPlatformStatistics();
    return ok(res, stats);
  }),
);

// --- Plans ---
superAdminRouter.post(
  '/plans',
  validate(createPlanSchema),
  asyncHandler(async (req, res) => {
    const plan = await subscriptionService.createPlan(req.body);
    return created(res, plan);
  }),
);

superAdminRouter.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    const plans = await subscriptionService.listPlans();
    return ok(res, plans);
  }),
);

// --- Subscriptions ---
superAdminRouter.post(
  '/subscriptions',
  validate(createSubscriptionSchema),
  asyncHandler(async (req, res) => {
    const sub = await subscriptionService.createSubscription(req.body.tenantId, req.body.planId, req.body.startDate);
    return created(res, sub);
  }),
);

superAdminRouter.get(
  '/subscriptions',
  asyncHandler(async (req, res) => {
    const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined;
    const subs = await subscriptionService.listSubscriptions(tenantId);
    return ok(res, subs);
  }),
);

superAdminRouter.post(
  '/subscriptions/:subscriptionId/suspend',
  asyncHandler(async (req, res) => {
    const sub = await subscriptionService.suspendSubscription(req.params.subscriptionId);
    return ok(res, sub);
  }),
);
