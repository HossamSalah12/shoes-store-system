import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/AppError';
import { assertTenantOwnership } from '../../lib/tenantGuard';
import { hashPassword } from '../../auth/password';
import { recordAudit } from '../audit/audit.service';

export async function listUsers(tenantId: string) {
  const users = await prisma.user.findMany({
    where: { tenantId },
    include: { userRoles: { include: { role: true } }, userBranches: { include: { branch: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    roles: u.userRoles.map((ur) => ({ id: ur.role.id, code: ur.role.code, name: ur.role.name })),
    branches: u.userBranches.map((ub) => ({ id: ub.branch.id, name: ub.branch.name })),
  }));
}

export async function getUser(tenantId: string, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { userRoles: { include: { role: true } }, userBranches: true },
  });
  return assertTenantOwnership(user, tenantId, 'User not found');
}

/**
 * Resolves a role by its actual database id and verifies it belongs to
 * this tenant (or is a null-tenant platform role, which is never assignable
 * here since this function is only reachable from tenant-scoped routes).
 * This — rather than a hardcoded enum of the 3 default role codes — is what
 * makes tenant-defined custom roles (see role.service.ts) assignable to
 * users, matching the fully data-driven Role/RolePermission design already
 * present in the Prisma schema.
 */
async function resolveTenantRoleById(tenantId: string, roleId: string) {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role || role.tenantId !== tenantId) {
    throw AppError.validation('The selected role does not belong to this tenant');
  }
  return role;
}

async function assertBranchesBelongToTenant(tenantId: string, branchIds: string[]) {
  if (branchIds.length === 0) return;
  const count = await prisma.branch.count({ where: { id: { in: branchIds }, tenantId } });
  if (count !== branchIds.length) {
    throw AppError.validation('One or more branchIds are invalid for this tenant');
  }
}

export async function createUser(
  tenantId: string,
  data: { fullName: string; email: string; password: string; roleId: string; branchIds: string[] },
  actingUserId: string,
) {
  const existing = await prisma.user.findUnique({ where: { tenantId_email: { tenantId, email: data.email } } });
  if (existing) throw AppError.conflict('A user with this email already exists in this tenant');

  await assertBranchesBelongToTenant(tenantId, data.branchIds);
  const role = await resolveTenantRoleById(tenantId, data.roleId);
  const passwordHash = await hashPassword(data.password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { tenantId, fullName: data.fullName, email: data.email, passwordHash, isActive: true },
    });
    await tx.userRole.create({ data: { userId: created.id, roleId: role.id } });
    if (data.branchIds.length > 0) {
      await tx.userBranch.createMany({
        data: data.branchIds.map((branchId) => ({ userId: created.id, branchId })),
      });
    }
    return created;
  });

  await recordAudit({ tenantId, userId: actingUserId, action: 'user.create', entityType: 'User', entityId: user.id, metadata: { role: role.code } });

  const { passwordHash: _omit, ...safe } = user;
  return safe;
}

export async function updateUser(
  tenantId: string,
  userId: string,
  data: { fullName?: string; roleId?: string; branchIds?: string[]; isActive?: boolean },
  actingUserId: string,
) {
  await getUser(tenantId, userId); // ownership check

  if (data.branchIds) {
    await assertBranchesBelongToTenant(tenantId, data.branchIds);
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { fullName: data.fullName, isActive: data.isActive },
    });

    if (data.roleId) {
      const role = await resolveTenantRoleById(tenantId, data.roleId);
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.create({ data: { userId, roleId: role.id } });
    }

    if (data.branchIds) {
      await tx.userBranch.deleteMany({ where: { userId } });
      if (data.branchIds.length > 0) {
        await tx.userBranch.createMany({ data: data.branchIds.map((branchId) => ({ userId, branchId })) });
      }
    }
  });

  await recordAudit({ tenantId, userId: actingUserId, action: 'user.update', entityType: 'User', entityId: userId });
  return getUser(tenantId, userId);
}

export async function deactivateUser(tenantId: string, userId: string, actingUserId: string) {
  await getUser(tenantId, userId);
  if (userId === actingUserId) {
    throw AppError.validation('You cannot deactivate your own account');
  }
  const user = await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
  await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await recordAudit({ tenantId, userId: actingUserId, action: 'user.deactivate', entityType: 'User', entityId: userId });
  const { passwordHash: _omit, ...safe } = user;
  return safe;
}
