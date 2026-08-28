import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { recordAudit } from '../audit/audit.service';
import { createExpenseSchema } from '@shoes/validation';
import { PERMISSIONS } from '@shoes/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireTenantUser } from '../../middleware/authorize';
import { requireBranchAccess } from '../../middleware/branchAccess';
import { validate } from '../../middleware/security';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok, created, paginated } from '../../utils/apiResponse';

export async function createExpense(
  tenantId: string,
  data: { branchId: string; category: string; amount: number; date: Date; description?: string },
  actingUserId: string,
) {
  const expense = await prisma.expense.create({ data: { tenantId, ...data, userId: actingUserId } });
  await recordAudit({ tenantId, userId: actingUserId, action: 'expense.create', entityType: 'Expense', entityId: expense.id, metadata: { amount: data.amount } });
  return expense;
}

export async function listExpenses(tenantId: string, branchId: string | undefined, page: number, pageSize: number) {
  const where = { tenantId, ...(branchId ? { branchId } : {}) };
  const [items, total] = await Promise.all([
    prisma.expense.findMany({ where, orderBy: { date: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { branch: { select: { id: true, name: true } } } }),
    prisma.expense.count({ where }),
  ]);
  return { items, total };
}

export const expenseRouter = Router();
expenseRouter.use(authenticate, requireTenantUser);

const listQuery = z.object({
  query: z.object({
    branchId: z.string().cuid().optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(200).default(25),
  }),
});

expenseRouter.get('/', requirePermission(PERMISSIONS.EXPENSE_VIEW), validate(listQuery), asyncHandler(async (req, res) => {
  const { branchId, page, pageSize } = req.query as any;
  const { items, total } = await listExpenses(req.authContext!.tenantId!, branchId, page, pageSize);
  return paginated(res, items, total, page, pageSize);
}));

expenseRouter.post('/', requirePermission(PERMISSIONS.EXPENSE_CREATE), validate(createExpenseSchema), requireBranchAccess('body', 'branchId'), asyncHandler(async (req, res) => {
  const expense = await createExpense(req.authContext!.tenantId!, req.body, req.authContext!.userId);
  return created(res, expense);
}));
