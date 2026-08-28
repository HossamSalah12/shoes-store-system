# Development Guide

## Prerequisites

- Node.js 20+ and npm 10+
- PostgreSQL 14+ (see [DATABASE_SETUP.md](DATABASE_SETUP.md))
- Git

## 1. Install dependencies

From the repo root (this installs and links all workspaces —
`packages/shared`, `packages/validation`, `apps/server`, `apps/desktop` — in
one pass thanks to npm workspaces):

```bash
npm install
```

## 2. Configure environment variables

```bash
cp .env.example apps/server/.env
cp apps/desktop/.env.example apps/desktop/.env
```

Edit `apps/server/.env`:
- Set a real `DATABASE_URL` (see DATABASE_SETUP.md).
- Generate strong secrets for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
  (e.g. `openssl rand -base64 48` — run it twice, they must be different).
- Set `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` for the first login.

`apps/desktop/.env` only needs `VITE_API_BASE_URL` pointing at your running
server (default `http://localhost:4000` is fine for local dev).

## 3. Build the shared packages

```bash
npm run build --workspace=packages/shared
npm run build --workspace=packages/validation
```

(`npm install` at the root does NOT automatically build these — Node needs
the compiled `dist/` output to resolve `@shoes/shared` / `@shoes/validation`
from `apps/server` and `apps/desktop`.)

> ⚠️ **This is not a one-time step.** `apps/server` resolves `@shoes/shared`
> and `@shoes/validation` through their published `dist/` build (via each
> package's `package.json` `"main"` field), NOT through their TypeScript
> source directly — unlike the Electron renderer, which Vite aliases straight
> to source (see `apps/desktop/vite.config.ts`). This means **every time you
> pull an update that touches a file under `packages/shared/src` or
> `packages/validation/src`** (new Zod schema, new permission key, changed
> field name, etc.), you must rebuild both packages again, or the server will
> keep running against the stale compiled output — symptoms include routes
> crashing with `Cannot read properties of undefined (reading 'safeParse')`,
> or validation rejecting fields that the current code actually sends/expects.
> `npm run dev:server` (from the repo root) now does this rebuild
> automatically before starting the server, so prefer that command over
> running `npm run dev` inside `apps/server` directly.

## 4. Set up the database

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

## 5. Run the backend

```bash
npm run dev:server
```

This starts the Express API with `tsx watch` (hot reload) on the port set
in `.env` (default `4000`). Confirm it's up:

```bash
curl http://localhost:4000/health
# {"status":"ok","timestamp":"..."}
```

## 6. Run the desktop app

In a second terminal:

```bash
npm run dev:desktop
```

This runs Vite (renderer, hot reload on `http://localhost:5173`) and
launches the Electron window pointed at it. On first launch you'll land on
the login screen — log in as the Super Admin to create your first tenant,
or (if you seeded demo data with `SEED_DEMO_DATA=true`) log in directly as
one of the demo tenant owners.

## 7. Typecheck / lint / test

```bash
npm run typecheck   # across all workspaces
npm run lint        # across all workspaces
npm run test        # apps/server unit + integration tests (node --test)
```

Backend-only, more granular:
```bash
cd apps/server
npm run test:unit          # pure logic tests, no DB required
npm run test:integration   # requires a running PostgreSQL (DATABASE_URL set)
```

## 8. Building for production

```bash
npm run build              # builds every workspace
npm run build:electron --workspace=apps/desktop   # produces an installer in apps/desktop/release
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for deploying the server and
distributing the desktop client.

## Project conventions

- All code is TypeScript, `strict: true`.
- Comments and identifiers are in English throughout the codebase (per the
  project's own convention), even though the UI itself is Arabic-first
  (RTL).
- Every tenant-scoped Prisma query must include an explicit `tenantId`
  filter — see `apps/server/src/lib/tenantGuard.ts` and existing service
  files under `apps/server/src/modules/*/*.service.ts` for the pattern to
  follow when adding new modules.
- Any new mutation to stock levels MUST go through
  `applyStockMovement` (`apps/server/src/modules/inventory/stockMovement.ts`)
  — never update `StockLevel` directly from another module.
