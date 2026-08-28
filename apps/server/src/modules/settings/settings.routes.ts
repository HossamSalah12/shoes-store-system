import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { recordAudit } from '../audit/audit.service';
import { PERMISSIONS } from '@shoes/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireTenantUser } from '../../middleware/authorize';
import { validate } from '../../middleware/security';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/apiResponse';

export async function getSettings(tenantId: string) {
  const settings = await prisma.settings.findUnique({ where: { tenantId } });
  if (settings) return settings;
  return prisma.settings.create({ data: { tenantId } });
}

export async function updateSettings(
  tenantId: string,
  data: Partial<{ currency: string; locale: string; invoicePrefix: string; lowStockThreshold: number }>,
  actingUserId: string,
) {
  await getSettings(tenantId);
  const settings = await prisma.settings.update({ where: { tenantId }, data });
  await recordAudit({ tenantId, userId: actingUserId, action: 'settings.update', entityType: 'Settings', entityId: settings.id, metadata: data });
  return settings;
}

export const settingsRouter = Router();
settingsRouter.use(authenticate, requireTenantUser);

const updateSchema = z.object({
  body: z.object({
    currency: z.string().min(1).max(10).optional(),
    locale: z.enum(['ar', 'en']).optional(),
    invoicePrefix: z.string().min(1).max(10).optional(),
    lowStockThreshold: z.number().int().nonnegative().optional(),
  }),
});

settingsRouter.get('/', requirePermission(PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.PRODUCT_VIEW), asyncHandler(async (req, res) => ok(res, await getSettings(req.authContext!.tenantId!))));
settingsRouter.patch('/', requirePermission(PERMISSIONS.SETTINGS_MANAGE), validate(updateSchema), asyncHandler(async (req, res) => ok(res, await updateSettings(req.authContext!.tenantId!, req.body, req.authContext!.userId))));
