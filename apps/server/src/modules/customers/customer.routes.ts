import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { assertTenantOwnership } from '../../lib/tenantGuard';
import { recordAudit } from '../audit/audit.service';
import { createCustomerSchema } from '@shoes/validation';
import { PERMISSIONS } from '@shoes/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireTenantUser } from '../../middleware/authorize';
import { validate } from '../../middleware/security';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok, created } from '../../utils/apiResponse';

export async function listCustomers(tenantId: string, search?: string) {
  return prisma.customer.findMany({
    where: {
      tenantId,
      ...(search
        ? { OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { phone: { contains: search } }] }
        : {}),
    },
    orderBy: { name: 'asc' },
  });
}

export async function getCustomer(tenantId: string, customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { sales: { orderBy: { createdAt: 'desc' }, take: 20 } },
  });
  return assertTenantOwnership(customer, tenantId, 'Customer not found');
}

export async function createCustomer(tenantId: string, data: { name: string; phone?: string; address?: string; notes?: string }, actingUserId: string) {
  const customer = await prisma.customer.create({ data: { tenantId, ...data } });
  await recordAudit({ tenantId, userId: actingUserId, action: 'customer.create', entityType: 'Customer', entityId: customer.id });
  return customer;
}

export async function updateCustomer(tenantId: string, customerId: string, data: Partial<{ name: string; phone: string; address: string; notes: string }>, actingUserId: string) {
  await getCustomer(tenantId, customerId);
  const customer = await prisma.customer.update({ where: { id: customerId }, data });
  await recordAudit({ tenantId, userId: actingUserId, action: 'customer.update', entityType: 'Customer', entityId: customerId });
  return customer;
}

export const customerRouter = Router();
customerRouter.use(authenticate, requireTenantUser);

customerRouter.get('/', requirePermission(PERMISSIONS.CUSTOMER_VIEW), asyncHandler(async (req, res) => ok(res, await listCustomers(req.authContext!.tenantId!, req.query.search as string | undefined))));
customerRouter.get('/:customerId', requirePermission(PERMISSIONS.CUSTOMER_VIEW), asyncHandler(async (req, res) => ok(res, await getCustomer(req.authContext!.tenantId!, req.params.customerId))));
customerRouter.post('/', requirePermission(PERMISSIONS.CUSTOMER_MANAGE), validate(createCustomerSchema), asyncHandler(async (req, res) => created(res, await createCustomer(req.authContext!.tenantId!, req.body, req.authContext!.userId))));
customerRouter.patch('/:customerId', requirePermission(PERMISSIONS.CUSTOMER_MANAGE), asyncHandler(async (req, res) => ok(res, await updateCustomer(req.authContext!.tenantId!, req.params.customerId, req.body, req.authContext!.userId))));
