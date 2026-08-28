import { AppError } from '../utils/AppError';

/**
 * TENANT ISOLATION STRATEGY
 * =========================
 * 1. Every tenant-scoped Prisma model has an explicit `tenantId` column
 *    (see schema.prisma) — isolation is never inferred through a chain of
 *    relations.
 * 2. Every list/query in a service MUST include `tenantId: ctx.tenantId`
 *    directly in its Prisma `where` clause. `ctx.tenantId` comes exclusively
 *    from `req.authContext`, which is derived server-side from the verified
 *    JWT + a fresh DB lookup (see middleware/authenticate.ts). It is NEVER
 *    taken from the request body, params or query string.
 * 3. Every "fetch a single row by id" operation MUST pass the result (or the
 *    lack of one) through `assertTenantOwnership` below before it is used
 *    or returned. This defeats IDOR: an attacker from tenant B guessing or
 *    reusing a valid id belonging to tenant A gets an identical 404 to a
 *    nonexistent id — never a 403, which would confirm the id exists.
 * 4. For writes (create/update/delete), tenantId is always taken from
 *    ctx.tenantId and written explicitly — never accepted from the client
 *    payload, so a malicious body cannot re-parent a record into another
 *    tenant.
 *
 * These four rules are also what apps/server/tests/unit/tenantGuard.test.ts
 * and apps/server/tests/integration/tenantIsolation.test.ts exercise.
 */

interface HasTenantId {
  tenantId: string | null;
}

/**
 * Given a row fetched WITHOUT a tenantId filter (e.g. because the id was the
 * only key available), verifies it belongs to the caller's tenant. Throws a
 * generic NOT_FOUND — indistinguishable from "row does not exist" — if it
 * does not, or if the row itself is null.
 */
export function assertTenantOwnership<T extends HasTenantId>(
  row: T | null | undefined,
  tenantId: string,
  notFoundMessage = 'Resource not found',
): T {
  if (!row || row.tenantId !== tenantId) {
    throw AppError.notFound(notFoundMessage);
  }
  return row;
}

/** Throws if the given context has no tenantId (i.e. is a platform Super Admin). */
export function requireTenantId(tenantId: string | null | undefined): string {
  if (!tenantId) {
    throw AppError.forbidden('This operation requires a tenant-scoped account');
  }
  return tenantId;
}
