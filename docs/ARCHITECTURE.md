# Architecture Notes

## Multi-tenancy model

Single database, shared schema, row-level isolation via an explicit
`tenantId` column on every tenant-scoped table (as opposed to
schema-per-tenant or database-per-tenant). This was chosen because:

- It scales to "a large number of customers" (spec requirement) without the
  operational overhead of provisioning a new schema/database per signup.
- Prisma's query API makes "always filter by tenantId" a straightforward,
  auditable convention to enforce in code review (`grep` for any
  `prisma.<model>.findMany` / `findUnique` call missing a `tenantId` in its
  `where`, or missing a subsequent `assertTenantOwnership` call).
- It keeps cross-tenant platform features (Super Admin statistics, plan
  management) simple — one query across all tenants — without cross-database
  joins.

The tradeoff — a single bad query without a `tenantId` filter could leak
data — is mitigated by the `assertTenantOwnership` pattern
(`apps/server/src/lib/tenantGuard.ts`) plus tests
(`apps/server/tests/unit/tenantGuard.test.ts`,
`apps/server/tests/integration/tenantIsolation.test.ts`) that specifically
exercise the cross-tenant-access-returns-404 behavior.

## Request authorization pipeline

Every tenant-scoped route passes through, in order:

1. `authenticate` — verifies the JWT, then **re-loads** the user's tenant
   status, roles, permissions, and branch assignments from the database
   (`buildAuthContext`). This means a permission revoked by an Owner, or a
   tenant disabled by the Super Admin, takes effect on the very next
   request — not after the (15-minute) access token would otherwise expire.
2. `requireTenantUser` / `requireSuperAdmin` — coarse-grained: is this a
   tenant account or the platform account?
3. `requirePermission(...)` — does the user's permission set (derived from
   their `Role` → `RolePermission` rows) include what this route needs?
4. `requireBranchAccess` (where applicable) — for the specific branch named
   in the request, does this user have access (Owner: implicit;
   Manager/Cashier: explicit `UserBranch` row)?
5. The service layer itself re-verifies ownership of every entity it loads
   by id (`assertTenantOwnership`), because steps 1-4 authorize the
   *action*, not any particular *entity* referenced deeper in the request
   body (e.g. a `productId` inside a purchase's line items).

## Inventory & concurrency

`StockLevel` is a denormalized "current quantity" cache, always written
in the same transaction as an append-only `StockMovement` row. The single
function permitted to touch `StockLevel`,
`apps/server/src/modules/inventory/stockMovement.ts::applyStockMovement`,
decrements stock via:

```sql
UPDATE "StockLevel"
SET quantity = quantity + :delta   -- delta is negative for a sale
WHERE "variantId" = :variantId AND "branchId" = :branchId
  AND quantity >= :requiredQuantity
```

If two cashiers at different branches (or the same branch, two terminals)
try to sell the last unit of the same variant simultaneously, PostgreSQL
serializes the two `UPDATE`s; the second one to execute sees the
already-decremented `quantity` and its `WHERE` clause fails to match zero
rows, so the function throws a `CONFLICT` and the entire sale transaction
rolls back — no negative stock, no lost update, no double-sell. This is
exercised by `apps/server/tests/unit/inventory.test.ts` at the logic level;
true concurrent-request behavior additionally requires PostgreSQL itself
(see `apps/server/tests/integration/`).

## POS idempotency

Every checkout request carries a client-generated `clientRequestId`
(UUID). `Sale` has a `@@unique([tenantId, clientRequestId])` constraint.
`createSale` first checks for an existing sale with that key and returns it
unchanged if found — so a cashier whose network drops right as the server
responds (but before the response reaches the desktop client) can safely
retry the exact same request: they get back the original sale, not a
second one. The frontend (`apps/desktop/src/pages/POS.tsx`) only rotates to
a fresh `clientRequestId` after a *confirmed* success, specifically so a
failed/timed-out attempt retries with the same key.

## Realtime

Socket.IO connections authenticate with the same JWT access token used for
REST, then join a `tenant:<tenantId>` room. Every mutation that changes
shared state (a sale, a stock adjustment, a transfer, a return) emits into
that room only — never broadcast globally — so tenant isolation holds on
the realtime channel exactly as it does on REST. See
`apps/server/src/realtime/socket.ts`.

## Why the Electron main process holds so little

`electron/main.ts` intentionally knows nothing about the database, JWT
secrets, or any server-internal configuration — only the public API base
URL. The renderer (React app) never gets direct filesystem/Node access
(`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`); the
only bridge is the narrow `window.desktopApi` surface defined in
`electron/preload.ts`, used exclusively to persist/retrieve the refresh
token via the OS keychain (`safeStorage`). If the renderer were ever
compromised via a supply-chain issue in a UI dependency, it still could not
read arbitrary files, spawn processes, or exfiltrate secrets that were
never given to it in the first place.

## Extending the system

Adding a new tenant-scoped module (say, "Coupons") should follow the same
five-file pattern used throughout `apps/server/src/modules/*`:
1. Add the Prisma model with an explicit `tenantId` (+ any `branchId` if
   branch-scoped) and appropriate `@@index`/`@@unique`.
2. Add Zod schemas in `packages/validation/src/*.schema.ts`.
3. Add permission keys in `packages/shared/src/permissions.ts` and wire
   them into `DEFAULT_ROLE_PERMISSIONS`.
4. Write `coupon.service.ts` (business logic, always filtering/writing
   `tenantId` from the caller's `authContext`, using `assertTenantOwnership`
   for any fetch-by-id) and `coupon.routes.ts` (thin HTTP layer:
   `authenticate` → `requireTenantUser` → `requirePermission` →
   `validate(schema)` → call the service).
5. Mount the router in `apps/server/src/app.ts`.
6. Add the corresponding desktop page under `apps/desktop/src/pages/` and a
   `Sidebar` entry gated by the new permission.
