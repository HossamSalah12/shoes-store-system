import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/AppError';
import { assertTenantOwnership } from '../../lib/tenantGuard';
import { recordAudit } from '../audit/audit.service';

export async function listRoles(tenantId: string) {
  const roles = await prisma.role.findMany({
    where: { tenantId },
    include: { rolePermissions: { include: { permission: true } }, _count: { select: { userRoles: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return roles.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    isSystem: r.isSystem,
    userCount: r._count.userRoles,
    permissions: r.rolePermissions.map((rp) => rp.permission.key),
  }));
}

export async function listAllPermissions() {
  return prisma.permission.findMany({ orderBy: { key: 'asc' } });
}

/**
 * Creates a custom, tenant-defined role (isSystem: false). The `code` is
 * derived from the name (slug-like, uppercased) purely for internal
 * uniqueness bookkeeping — permission checks throughout the backend match
 * on permission *keys*, never on role code, so a custom role's code has no
 * special meaning to the authorization logic.
 */
export async function createCustomRole(tenantId: string, name: string, permissionKeys: string[], actingUserId: string) {
  const code = `CUSTOM_${name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_${Date.now().toString(36).toUpperCase()}`;

  const validPermissions = await prisma.permission.findMany({ where: { key: { in: permissionKeys } } });
  if (validPermissions.length !== new Set(permissionKeys).size) {
    throw AppError.validation('One or more permission keys are invalid');
  }

  const role = await prisma.$transaction(async (tx) => {
    const created = await tx.role.create({ data: { tenantId, code, name, isSystem: false } });
    if (validPermissions.length > 0) {
      await tx.rolePermission.createMany({
        data: validPermissions.map((p) => ({ roleId: created.id, permissionId: p.id })),
      });
    }
    return created;
  });

  await recordAudit({ tenantId, userId: actingUserId, action: 'role.create', entityType: 'Role', entityId: role.id, metadata: { name, permissions: permissionKeys } });

  return role;
}

/**
 * Replaces a role's entire permission set. Allowed for BOTH system and
 * custom roles — an Owner may legitimately want to, say, remove
 * `sale.apply_discount` from the default CASHIER role for their store
 * (spec allows Cashier discount "based on permission"). The three default
 * roles remain otherwise protected: they cannot be deleted or renamed (see
 * deleteRole below), only their permission set is adjustable.
 */
export async function updateRolePermissions(tenantId: string, roleId: string, permissionKeys: string[], actingUserId: string) {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  assertTenantOwnership(role, tenantId, 'Role not found');

  const validPermissions = await prisma.permission.findMany({ where: { key: { in: permissionKeys } } });
  if (validPermissions.length !== new Set(permissionKeys).size) {
    throw AppError.validation('One or more permission keys are invalid');
  }

  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId } });
    if (validPermissions.length > 0) {
      await tx.rolePermission.createMany({ data: validPermissions.map((p) => ({ roleId, permissionId: p.id })) });
    }
  });

  await recordAudit({ tenantId, userId: actingUserId, action: 'role.update_permissions', entityType: 'Role', entityId: roleId, metadata: { permissions: permissionKeys } });

  return prisma.role.findUnique({ where: { id: roleId }, include: { rolePermissions: { include: { permission: true } } } });
}

export async function deleteCustomRole(tenantId: string, roleId: string, actingUserId: string) {
  const found = await prisma.role.findUnique({ where: { id: roleId }, include: { _count: { select: { userRoles: true } } } });
  const role = assertTenantOwnership(found, tenantId, 'Role not found');

  if (role.isSystem) {
    throw AppError.forbidden('System roles (Owner, Branch Manager, Cashier) cannot be deleted');
  }
  if (role._count.userRoles > 0) {
    throw AppError.conflict('Cannot delete a role that is still assigned to one or more users');
  }

  await prisma.role.delete({ where: { id: roleId } });
  await recordAudit({ tenantId, userId: actingUserId, action: 'role.delete', entityType: 'Role', entityId: roleId });
}
