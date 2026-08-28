import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@shoes/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireTenantUser } from '../../middleware/authorize';
import { validate } from '../../middleware/security';
import { asyncHandler } from '../../utils/asyncHandler';
import { paginated } from '../../utils/apiResponse';
import { listAuditLogs } from './audit.service';

export const auditRouter = Router();
auditRouter.use(authenticate, requireTenantUser);

const listQuery = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(200).default(50),
  }),
});

auditRouter.get(
  '/',
  requirePermission(PERMISSIONS.AUDIT_VIEW),
  validate(listQuery),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = req.query as any;
    const { items, total } = await listAuditLogs(req.authContext!.tenantId!, page, pageSize);
    return paginated(res, items, total, page, pageSize);
  }),
);
