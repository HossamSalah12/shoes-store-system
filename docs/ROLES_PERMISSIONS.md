# Roles & Permissions

## Role tiers

| Role | Scope | Description |
|---|---|---|
| `SUPER_ADMIN` | Platform (no `tenantId`) | Owns the whole system. Manages tenants, plans, subscriptions. Does **not** manage day-to-day store data (products, sales, etc.) for any tenant — that would defeat tenant isolation. |
| `OWNER` | One tenant, all its branches | Full control of their own store: branches, users, products, inventory, purchases, sales, suppliers, customers, expenses, reports, settings. |
| `BRANCH_MANAGER` | One or more explicitly assigned branches | Runs day-to-day operations for their branch(es): sales, returns, inventory adjustments, purchases, expenses, branch-level reports. Cannot manage other branches, users, or tenant-wide settings. |
| `CASHIER` | One or more explicitly assigned branches | POS-focused: search products, scan barcodes, build a cart, checkout, view sales, create returns. Cannot manage inventory levels directly, cannot see other branches' data, cannot manage users. |

Roles are seeded per-tenant as data rows (`Role` + `RolePermission`), not
hard-coded — see `packages/shared/src/permissions.ts`
(`DEFAULT_ROLE_PERMISSIONS`) for the source of truth, applied at tenant
creation time by `apps/server/src/modules/superadmin/tenant.service.ts`.

## Full permission matrix

Legend: ✅ granted by default, — not granted.

| Permission key | Super Admin | Owner | Branch Manager | Cashier |
|---|:---:|:---:|:---:|:---:|
| `platform.manage_tenants` | ✅ | — | — | — |
| `platform.manage_plans` | ✅ | — | — | — |
| `platform.manage_subscriptions` | ✅ | — | — | — |
| `platform.view_statistics` | ✅ | — | — | — |
| `branch.create` | — | ✅ | — | — |
| `branch.update` | — | ✅ | — | — |
| `branch.delete` | — | ✅ | — | — |
| `branch.view` | — | ✅ | ✅ | — |
| `user.create` | — | ✅ | — | — |
| `user.update` | — | ✅ | — | — |
| `user.delete` | — | ✅ | — | — |
| `user.view` | — | ✅ | ✅ | — |
| `role.manage` | — | ✅ | — | — |
| `product.create` | — | ✅ | — | — |
| `product.update` | — | ✅ | ✅ | — |
| `product.delete` | — | ✅ | — | — |
| `product.view` | — | ✅ | ✅ | ✅ |
| `inventory.view` | — | ✅ | ✅ | ✅ |
| `inventory.adjust` | — | ✅ | ✅ | — |
| `inventory.transfer` | — | ✅ | — | — |
| `purchase.create` | — | ✅ | ✅ | — |
| `purchase.view` | — | ✅ | ✅ | — |
| `supplier.manage` | — | ✅ | — | — |
| `supplier.view` | — | ✅ | ✅ | — |
| `customer.manage` | — | ✅ | ✅ | — |
| `customer.view` | — | ✅ | ✅ | ✅ |
| `pos.open` | — | ✅ | ✅ | ✅ |
| `sale.create` | — | ✅ | ✅ | ✅ |
| `sale.view` | — | ✅ | ✅ | ✅ |
| `sale.apply_discount` | — | ✅ | ✅ | — |
| `sale.cancel` | — | ✅ | — | — |
| `return.create` | — | ✅ | ✅ | ✅ |
| `return.view` | — | ✅ | ✅ | — |
| `expense.create` | — | ✅ | ✅ | — |
| `expense.view` | — | ✅ | ✅ | — |
| `report.view_branch` | — | ✅ | ✅ | — |
| `report.view_tenant` | — | ✅ | — | — |
| `settings.manage` | — | ✅ | — | — |
| `subscription.view` | — | ✅ | — | — |
| `audit.view` | — | ✅ | — | — |

## Branch-scoping rule (independent of the table above)

Holding a permission is necessary but not sufficient for branch-scoped
resources: a `BRANCH_MANAGER`/`CASHIER` also needs an explicit `UserBranch`
assignment for the specific branch being acted on. An `OWNER` is implicitly
authorized for every branch belonging to their own tenant. This is enforced
by `apps/server/src/middleware/branchAccess.ts` in addition to
`requirePermission`, and both must pass.

## Extending the permission set

1. Add the new key to `PERMISSIONS` in `packages/shared/src/permissions.ts`.
2. Add it to the relevant role(s) in `DEFAULT_ROLE_PERMISSIONS`.
3. Add its human-readable description in
   `apps/server/prisma/seed.ts` (`PERMISSION_DESCRIPTIONS`).
4. Re-run `npm run prisma:seed` (idempotent — uses `upsert`) so existing
   deployments pick up the new permission without losing data.
5. Guard the relevant route with `requirePermission(PERMISSIONS.YOUR_NEW_KEY)`.

Custom, tenant-defined roles beyond the three defaults are supported at the
data-model level (`Role.isSystem = false`) but the current UI
(`apps/desktop/src/pages/Roles.tsx`) is read-only; adding a role-builder UI
is a natural next increment on top of the existing `/api/roles` +
`RolePermission` infrastructure.
