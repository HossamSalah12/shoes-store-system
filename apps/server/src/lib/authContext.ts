import type { AuthenticatedUserContext } from '@shoes/shared';
import { ROLES } from '@shoes/shared';
import { prisma } from './prisma';
import { AppError } from '../utils/AppError';

/**
 * Loads a user's roles, effective permissions (union of all role
 * permissions) and explicit branch assignments directly from the database.
 * This is called on every authenticated request (after JWT verification) —
 * we deliberately do NOT trust roles/permissions embedded in the JWT payload
 * for anything except a coarse "which roles did you have when you logged
 * in" hint, because permission changes (e.g. an Owner revoking a Cashier's
 * discount permission) must take effect immediately, not after the access
 * token expires.
 */
export async function buildAuthContext(userId: string): Promise<AuthenticatedUserContext> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } },
      userBranches: true,
    },
  });

  if (!user || !user.isActive) {
    throw AppError.unauthenticated('User account is inactive or no longer exists');
  }

  if (user.tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
    if (!tenant || tenant.status !== 'ACTIVE') {
      throw AppError.tenantDisabled();
    }
  }

  const roleCodes = user.userRoles.map((ur) => ur.role.code);
  const isSuperAdmin = roleCodes.includes(ROLES.SUPER_ADMIN);

  const permissionSet = new Set<string>();
  for (const userRole of user.userRoles) {
    for (const rp of userRole.role.rolePermissions) {
      permissionSet.add(rp.permission.key);
    }
  }

  return {
    userId: user.id,
    tenantId: user.tenantId,
    sessionId: '', // filled in by caller from the token payload
    roleCodes,
    permissions: Array.from(permissionSet),
    branchIds: user.userBranches.map((ub) => ub.branchId),
    isSuperAdmin,
  };
}
