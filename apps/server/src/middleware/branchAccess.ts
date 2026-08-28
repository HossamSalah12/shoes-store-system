import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedUserContext } from '@shoes/shared';
import { ROLES } from '@shoes/shared';
import { AppError } from '../utils/AppError';

/**
 * Returns true if the authenticated user is allowed to operate on the given
 * branch.
 *  - OWNER: implicit access to every branch belonging to their own tenant
 *    (branch ownership itself is verified separately via tenantId, see
 *    services that load the Branch row with a `tenantId` filter).
 *  - BRANCH_MANAGER / CASHIER: only branches explicitly listed in
 *    ctx.branchIds (populated from the UserBranch join table).
 *  - SUPER_ADMIN: never implicitly granted branch access — platform admins
 *    manage tenants/plans, not day-to-day branch operations.
 */
export function hasBranchAccess(ctx: AuthenticatedUserContext, branchId: string): boolean {
  if (ctx.roleCodes.includes(ROLES.OWNER)) return true;
  return ctx.branchIds.includes(branchId);
}

export function assertBranchAccess(ctx: AuthenticatedUserContext, branchId: string): void {
  if (!hasBranchAccess(ctx, branchId)) {
    throw AppError.forbidden('You do not have access to this branch');
  }
}

type BranchIdSource = 'body' | 'params' | 'query';

/**
 * Express middleware factory: validates that `req[source].branchId` (or a
 * custom field name) is a branch the current user may access. This is a
 * first line of defense for routes where the branch id is supplied directly
 * by the client; services must STILL re-verify branch->tenant ownership
 * against the database (a user could pass a syntactically valid branchId
 * belonging to a different tenant entirely).
 */
export function requireBranchAccess(source: BranchIdSource = 'body', field = 'branchId') {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.authContext) throw AppError.unauthenticated();
    const branchId = (req as any)[source]?.[field];
    if (!branchId || typeof branchId !== 'string') {
      throw AppError.validation(`${field} is required`);
    }
    assertBranchAccess(req.authContext, branchId);
    next();
  };
}
