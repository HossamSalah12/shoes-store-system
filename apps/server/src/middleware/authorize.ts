import type { NextFunction, Request, Response } from 'express';
import type { PermissionKey, RoleCode } from '@shoes/shared';
import { AppError } from '../utils/AppError';

function getContextOrThrow(req: Request) {
  if (!req.authContext) {
    // Programmer error: authorize used without authenticate running first.
    throw AppError.unauthenticated();
  }
  return req.authContext;
}

/**
 * Requires the authenticated user to hold AT LEAST ONE of the given
 * permissions. SUPER_ADMIN is platform-level and does not automatically
 * bypass tenant-scoped permission checks — it only bypasses on routes that
 * are explicitly mounted under /api/platform (see requireSuperAdmin below),
 * which keeps the "super admin doesn't casually see tenant data" property
 * from the spec.
 */
export function requirePermission(...permissions: PermissionKey[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const ctx = getContextOrThrow(req);
    const hasPermission = permissions.some((p) => ctx.permissions.includes(p));
    if (!hasPermission) {
      throw AppError.forbidden(`Missing required permission: ${permissions.join(' or ')}`);
    }
    next();
  };
}

/** Requires the user to hold one of the given system role codes. */
export function requireRole(...roles: RoleCode[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const ctx = getContextOrThrow(req);
    const hasRole = roles.some((r) => ctx.roleCodes.includes(r));
    if (!hasRole) {
      throw AppError.forbidden(`Requires one of roles: ${roles.join(', ')}`);
    }
    next();
  };
}

/** Platform-level routes only (Tenant/Plan/Subscription management). */
export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  const ctx = getContextOrThrow(req);
  if (!ctx.isSuperAdmin) {
    throw AppError.forbidden('Super Admin access required');
  }
  next();
}

/** Ensures the caller belongs to a tenant (i.e. is NOT the platform Super Admin). */
export function requireTenantUser(req: Request, _res: Response, next: NextFunction) {
  const ctx = getContextOrThrow(req);
  if (!ctx.tenantId) {
    throw AppError.forbidden('This action requires a tenant-scoped account');
  }
  next();
}
