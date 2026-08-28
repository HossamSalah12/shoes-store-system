import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/AppError';

export async function createPlan(data: {
  name: string;
  maxBranches: number;
  maxUsers: number;
  durationDays: number;
  priceCents: number;
  features: string[];
}) {
  return prisma.plan.create({ data });
}

export async function listPlans() {
  return prisma.plan.findMany({ where: { isActive: true }, orderBy: { priceCents: 'asc' } });
}

export async function createSubscription(tenantId: string, planId: string, startDate: Date) {
  const [tenant, plan] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId } }),
    prisma.plan.findUnique({ where: { id: planId } }),
  ]);
  if (!tenant) throw AppError.notFound('Tenant not found');
  if (!plan) throw AppError.notFound('Plan not found');

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + plan.durationDays);

  return prisma.subscription.create({
    data: { tenantId, planId, startDate, endDate, status: 'ACTIVE' },
  });
}

export async function listSubscriptions(tenantId?: string) {
  return prisma.subscription.findMany({
    where: tenantId ? { tenantId } : {},
    include: { plan: true, tenant: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function suspendSubscription(subscriptionId: string) {
  return prisma.subscription.update({ where: { id: subscriptionId }, data: { status: 'SUSPENDED' } });
}

/**
 * Should be invoked on a schedule (e.g. daily cron) to flip subscriptions
 * whose endDate has passed from ACTIVE/TRIAL to EXPIRED. Exposed here as a
 * plain function so it can be called from a cron entrypoint, from an admin
 * "recalculate" button, or from a test.
 */
export async function expireOverdueSubscriptions(): Promise<number> {
  const result = await prisma.subscription.updateMany({
    where: { status: { in: ['ACTIVE', 'TRIAL'] }, endDate: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  });
  return result.count;
}
