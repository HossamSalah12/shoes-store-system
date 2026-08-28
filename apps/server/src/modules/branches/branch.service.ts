import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/AppError';
import { assertTenantOwnership } from '../../lib/tenantGuard';
import { recordAudit } from '../audit/audit.service';

export async function listBranches(tenantId: string) {
  return prisma.branch.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
}

export async function getBranch(tenantId: string, branchId: string) {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  return assertTenantOwnership(branch, tenantId, 'Branch not found');
}

export async function createBranch(
  tenantId: string,
  data: { name: string; address?: string; phone?: string },
  actingUserId: string,
) {
  const existing = await prisma.branch.findUnique({ where: { tenantId_name: { tenantId, name: data.name } } });
  if (existing) throw AppError.conflict('A branch with this name already exists');

  const branch = await prisma.branch.create({ data: { tenantId, ...data } });
  await recordAudit({ tenantId, userId: actingUserId, action: 'branch.create', entityType: 'Branch', entityId: branch.id });
  return branch;
}

export async function updateBranch(
  tenantId: string,
  branchId: string,
  data: { name?: string; address?: string; phone?: string; isActive?: boolean },
  actingUserId: string,
) {
  await getBranch(tenantId, branchId); // ownership check
  const branch = await prisma.branch.update({ where: { id: branchId }, data });
  await recordAudit({ tenantId, userId: actingUserId, action: 'branch.update', entityType: 'Branch', entityId: branchId });
  return branch;
}

export async function deleteBranch(tenantId: string, branchId: string, actingUserId: string) {
  await getBranch(tenantId, branchId);
  const salesCount = await prisma.sale.count({ where: { branchId } });
  if (salesCount > 0) {
    // Never hard-delete a branch with sales history; deactivate instead to
    // preserve financial/audit integrity.
    const branch = await prisma.branch.update({ where: { id: branchId }, data: { isActive: false } });
    await recordAudit({ tenantId, userId: actingUserId, action: 'branch.deactivate', entityType: 'Branch', entityId: branchId });
    return branch;
  }
  await prisma.branch.delete({ where: { id: branchId } });
  await recordAudit({ tenantId, userId: actingUserId, action: 'branch.delete', entityType: 'Branch', entityId: branchId });
  return null;
}
