import { prisma } from '../../lib/prisma';
import { ROLES } from '@shoes/shared';
import type { AuthenticatedUserContext } from '@shoes/shared';

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * Resolves the effective branch filter for reports based on the caller's
 * role: an OWNER sees every branch of their tenant; a BRANCH_MANAGER or
 * CASHIER only sees the branches explicitly assigned to them
 * (ctx.branchIds). This mirrors the same rule used for write access
 * (middleware/branchAccess.ts) so reports can never reveal figures for a
 * branch the caller isn't otherwise allowed to operate in.
 */
function resolveBranchFilter(ctx: AuthenticatedUserContext): { branchId?: { in: string[] } } {
  if (ctx.roleCodes.includes(ROLES.OWNER)) return {};
  return { branchId: { in: ctx.branchIds } };
}

export async function getDashboard(ctx: AuthenticatedUserContext) {
  const tenantId = ctx.tenantId!;
  const branchFilter = resolveBranchFilter(ctx);
  const today = startOfDay();
  const monthStart = startOfMonth();

  const [
    todaySalesAgg,
    monthSalesAgg,
    totalSalesAgg,
    salesByBranch,
    bestSellingVariants,
    lowStockCount,
    stockValueRows,
    expensesAgg,
    returnsAgg,
  ] = await Promise.all([
    prisma.sale.aggregate({
      where: { tenantId, status: 'COMPLETED', createdAt: { gte: today }, ...branchFilter },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.sale.aggregate({
      where: { tenantId, status: 'COMPLETED', createdAt: { gte: monthStart }, ...branchFilter },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.sale.aggregate({
      where: { tenantId, status: 'COMPLETED', ...branchFilter },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.sale.groupBy({
      by: ['branchId'],
      where: { tenantId, status: 'COMPLETED', ...branchFilter },
      _sum: { totalAmount: true },
    }),
    prisma.saleItem.groupBy({
      by: ['variantId'],
      where: { sale: { tenantId, status: 'COMPLETED', ...branchFilter } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    }),
    prisma.stockLevel.count({ where: { tenantId, quantity: { lte: 5 }, ...(branchFilter.branchId ? { branchId: branchFilter.branchId } : {}) } }),
    prisma.stockLevel.findMany({
      where: { tenantId, ...(branchFilter.branchId ? { branchId: branchFilter.branchId } : {}) },
      include: { variant: true },
    }),
    prisma.expense.aggregate({ where: { tenantId, ...branchFilter }, _sum: { amount: true } }),
    prisma.return.aggregate({ where: { tenantId, ...(branchFilter.branchId ? { branchId: branchFilter.branchId } : {}) }, _sum: { totalAmount: true } }),
  ]);

  const branchIds = salesByBranch.map((s) => s.branchId);
  const branches = await prisma.branch.findMany({ where: { id: { in: branchIds } } });
  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));

  const stockValue = stockValueRows.reduce((sum, row) => sum + row.quantity * Number(row.variant.costPrice), 0);

  const variantIds = bestSellingVariants.map((v) => v.variantId);
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: { product: true, size: true, color: true },
  });
  const variantById = new Map(variants.map((v) => [v.id, v]));

  const bestSellingProducts = bestSellingVariants.map((v) => ({
    variantId: v.variantId,
    quantitySold: v._sum.quantity ?? 0,
    product: variantById.get(v.variantId)?.product.name ?? 'Unknown',
    size: variantById.get(v.variantId)?.size.label,
    color: variantById.get(v.variantId)?.color.name,
  }));

  const revenue = Number(totalSalesAgg._sum.totalAmount ?? 0);
  const expensesTotal = Number(expensesAgg._sum.amount ?? 0);
  const returnsTotal = Number(returnsAgg._sum.totalAmount ?? 0);

  return {
    todaySales: { total: Number(todaySalesAgg._sum.totalAmount ?? 0), count: todaySalesAgg._count },
    monthlySales: { total: Number(monthSalesAgg._sum.totalAmount ?? 0), count: monthSalesAgg._count },
    totalSales: { total: revenue, count: totalSalesAgg._count },
    salesByBranch: salesByBranch.map((s) => ({
      branchId: s.branchId,
      branchName: branchNameById.get(s.branchId) ?? 'Unknown',
      total: Number(s._sum.totalAmount ?? 0),
    })),
    bestSellingProducts,
    lowStockCount,
    stockValue,
    expenses: expensesTotal,
    returns: returnsTotal,
    estimatedProfit: revenue - expensesTotal - returnsTotal,
  };
}

export async function getBestSizesAndColors(tenantId: string, branchFilter: { branchId?: { in: string[] } }) {
  const items = await prisma.saleItem.findMany({
    where: { sale: { tenantId, status: 'COMPLETED', ...branchFilter } },
    include: { variant: { include: { size: true, color: true } } },
  });

  const bySize = new Map<string, number>();
  const byColor = new Map<string, number>();
  for (const item of items) {
    bySize.set(item.variant.size.label, (bySize.get(item.variant.size.label) ?? 0) + item.quantity);
    byColor.set(item.variant.color.name, (byColor.get(item.variant.color.name) ?? 0) + item.quantity);
  }

  const toSortedArray = (m: Map<string, number>) =>
    Array.from(m.entries())
      .map(([label, quantity]) => ({ label, quantity }))
      .sort((a, b) => b.quantity - a.quantity);

  return { bestSizes: toSortedArray(bySize).slice(0, 10), bestColors: toSortedArray(byColor).slice(0, 10) };
}
