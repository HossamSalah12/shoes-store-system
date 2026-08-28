# Shoes Store Management System

A production-oriented, multi-tenant SaaS desktop application for managing shoe
stores: multi-branch inventory, POS, purchases, suppliers, customers,
expenses, reports, and subscription/plan management — with a dedicated
Super Admin platform layer.

This is **not** a prototype. Every module listed below is backed by real
Prisma models, real transactional business logic, and real authorization
checks. It has **not** been run against a live PostgreSQL database or
packaged as an Electron installer inside the environment this was built in
(no internet access, no PostgreSQL server available there) — see
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for exactly what to run on your
machine to bring it fully online, and the final report message in the
conversation for what was actually executed vs. what still needs local
verification.

## Tech stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron (hardened: `contextIsolation`, no `nodeIntegration`, sandboxed) |
| Frontend | React 18 + TypeScript + Tailwind CSS + Vite |
| Backend | Node.js + TypeScript + Express |
| Database | PostgreSQL |
| ORM | Prisma |
| Validation | Zod |
| Realtime | Socket.IO (tenant-scoped rooms) |
| Auth | JWT (access + rotating refresh tokens), bcrypt |

## Monorepo layout

```
/apps
  /server      Node.js/Express API (multi-tenant, RBAC, POS, inventory, reports...)
  /desktop     Electron + React desktop client
/packages
  /shared      Permission catalogue, roles, shared TypeScript types
  /validation  Zod schemas shared by the API routes (and reusable by the client)
/docs          Setup, deployment, API, roles, backup/restore documentation
```

## Core architectural guarantees

- **Tenant isolation is enforced in the backend, not the UI.** Every
  tenant-scoped Prisma model carries an explicit `tenantId` column, every
  service filters on it, and every "fetch by id" call passes through
  `assertTenantOwnership` (`apps/server/src/lib/tenantGuard.ts`), which
  returns an identical `404 NOT_FOUND` for both "doesn't exist" and
  "belongs to a different tenant" — never a `403`, so an attacker can never
  use the response to confirm an ID exists in another tenant.
- **Branch access** is enforced the same way: an `OWNER` implicitly has
  access to every branch in their tenant; `BRANCH_MANAGER`/`CASHIER` only to
  branches explicitly assigned via the `UserBranch` join table.
- **Shared, per-branch inventory** with a single, centralized, atomic mutator
  (`applyStockMovement` in `apps/server/src/modules/inventory/stockMovement.ts`)
  that every sale/purchase/return/transfer/adjustment must go through. Stock
  decrements use a conditional `UPDATE ... WHERE quantity >= :delta` so two
  concurrent sales can never oversell the same variant/branch.
- **Idempotent POS checkout**: every sale carries a client-generated
  `clientRequestId`; retried checkout requests (e.g. after a dropped
  connection) return the original sale instead of creating a duplicate.
- **Permissions are data-driven**, not hard-coded per role: `Role` →
  `RolePermission` → `Permission` rows, seeded from
  `packages/shared/src/permissions.ts`, checked on every request via
  `requirePermission` middleware — never inferred from the JWT payload alone
  (the DB is re-queried on every authenticated request).

## Where to go next

- [docs/DATABASE_SETUP.md](docs/DATABASE_SETUP.md) — install PostgreSQL, create the DB, run migrations & seed
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — run the server and the desktop app locally
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — production deployment guide
- [docs/API.md](docs/API.md) — REST API reference
- [docs/ROLES_PERMISSIONS.md](docs/ROLES_PERMISSIONS.md) — role/permission matrix
- [docs/BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md) — backup & restore procedures
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — deeper architectural notes

## Quick start (once you have Node.js 20+ and PostgreSQL installed)

```bash
git clone <this project>
cd shoes-store-system
cp .env.example apps/server/.env       # then edit apps/server/.env
cp apps/desktop/.env.example apps/desktop/.env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev:server     # in one terminal
npm run dev:desktop    # in another terminal
```

Default Super Admin login (change immediately after first login, and change
`SUPER_ADMIN_PASSWORD` before seeding in any real environment):

```
email: superadmin@shoes-system.local
password: (value of SUPER_ADMIN_PASSWORD in apps/server/.env)
```
