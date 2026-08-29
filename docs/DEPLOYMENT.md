# Production Deployment Guide

## Overview

Two independent deliverables are deployed separately:
1. **The backend API** (`apps/server`) — a stateless Node.js process behind
   HTTPS, talking to a managed PostgreSQL instance.
2. **The desktop client** (`apps/desktop`) — packaged as a native installer
   (`.exe`/`.dmg`/`.AppImage`) and distributed to each store's Windows/macOS/
   Linux machines. It talks to the backend over the internet — it does
   **not** need to be on the same network/LAN as the server or the other
   branches (per spec §17).

## 0. Free-tier testing deployment (100% free, no credit card, no expiry)

Before committing to a paid production setup, you can put the backend on
fully free infrastructure purely to test the system end-to-end from outside
your own machine. The combination below has **no time limit, no forced
expiry, and never asks for a credit card**:

- **Database**: [Neon.tech](https://neon.tech) — free Postgres, no 90-day
  expiry, no card required. (Its free compute auto-suspends after a few
  minutes of inactivity and wakes back up automatically on the next query —
  a few seconds' delay, not a problem for testing.)
- **App server**: [Bonto.dev](https://bonto.dev) — free Node.js hosting,
  no card required, supports WebSockets natively (needed for Socket.IO's
  persistent realtime connections — platforms that only run Node as
  serverless functions, like Vercel or Netlify, cannot host this backend).

> Render.com was the original recommendation here, but Render now prompts
> for a credit card during Web Service creation even when selecting the
> free instance type. Bonto.dev is the replacement: verified free, no
> card, WebSocket-capable, at the time of writing. Hosting platforms change
> their policies without much notice — if Bonto ever adds a card
> requirement too, search for "free Node.js hosting no credit card
> websocket" and re-verify before signing up anywhere.

### Step 1 — Create the free database on Neon
1. Sign up at [neon.tech](https://neon.tech) (email only, no card).
2. **Create a project** → note the connection string it gives you, e.g.:
   ```
   postgresql://user:password@ep-xxxx.region.aws.neon.tech/dbname?sslmode=require
   ```
   This full string is your `DATABASE_URL` — copy it as-is (it already
   includes `sslmode=require`, which Neon requires).

### Step 2 — Push the project to GitHub
Bonto supports Git push-to-deploy from a GitHub repository. Create a repo
(public or private) and push this project to it if you haven't already.

### Step 3 — Create the app on Bonto and connect the repo
1. Sign up at [bonto.dev](https://bonto.dev) (email only, no card).
2. Create a new app and connect it to your GitHub repository (or set the
   repo as a Git remote and push directly — see Bonto's docs for whichever
   flow is currently offered in its dashboard).
3. Bonto auto-detects Node.js via the root `package.json` and runs
   `npm install` followed by the `start` script. This repo's root
   `package.json` already defines a single self-contained `start` script
   for exactly this style of platform:
   ```json
   "start": "npm run build --workspace=packages/shared && npm run build --workspace=packages/validation && npm run build --workspace=apps/server && npx prisma generate --schema=apps/server/prisma/schema.prisma && npx prisma migrate deploy --schema=apps/server/prisma/schema.prisma && npm run prisma:seed --workspace=apps/server && node apps/server/dist/index.js"
   ```
   It builds every workspace package, generates the Prisma client, applies
   pending migrations, runs the (idempotent — safe to repeat) seed script,
   then starts the server — all from one command, no separate build-step
   configuration needed. You do not need to change anything here; it's
   already wired up.
4. Confirm your app is set to listen on `process.env.PORT` — it already
   does (`apps/server/src/config/env.ts` reads `PORT` from the
   environment with no hardcoded value required).

### Step 4 — Environment variables
In the app's environment variables settings, add:
- `DATABASE_URL` → the Neon connection string from Step 1
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` → two different strong random values
- `NODE_ENV=production`
- `CORS_ALLOWED_ORIGINS` → `http://localhost:5173` (your local Electron dev renderer, so your desktop app on your own machine is allowed to call this remote server)
- `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`
- `SEED_DEMO_DATA=true` if you also want the Hussein/Mohamed demo tenants created automatically on first start

### Step 5 — Point the desktop app at it
In `apps/desktop/.env`:
```
VITE_API_BASE_URL=https://your-app-name.bonto.run
```
(replace with whatever subdomain Bonto actually assigns your app). Restart
`npm run dev:desktop`. No Electron/CSP changes are needed — the CSP in
`electron/main.ts` already allows `https:`/`wss:` connections in both dev
and production; it was only ever restrictive about *plain http* localhost
origins.

### What "free" actually costs you here (read this so nothing surprises you)
- **Bonto's free tier includes 75 runtime hours per month** and auto-sleeps
  the app after ~30 minutes of inactivity, waking automatically on the next
  request. 75 hours/month is roughly 2.5 hours/day on average — plenty for
  periodic testing sessions, not enough for permanently-on production
  traffic. There's no card and no forced deletion; you simply stop being
  served once the monthly hour allowance runs out, and it resets next month.
- **Neon's free compute auto-suspends** similarly after a few idle minutes,
  with a short wake-up (typically 1–2 seconds) — usually imperceptible.
- Neither of these ever expires, deletes your data, or asks for payment
  details.

### Alternative: Render's own free PostgreSQL (simpler, but time-limited)
If you end up using Render anyway for some other reason and don't mind a
hard cutoff, Render also offers its own free PostgreSQL (**New →
PostgreSQL** → free plan) — copy its Internal/External Database URL as
`DATABASE_URL` instead of Neon's. The tradeoff: **Render deletes free
databases after 90 days**. Neon has no such deadline.

## 1. Backend deployment (production)

### Environment

Set every variable from `.env.example` in your hosting provider's secret
manager (never commit a real `.env`):

- `DATABASE_URL` → your managed PostgreSQL connection string (with
  `sslmode=require` in production)
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` → strong, unique, rotated
  periodically
- `CORS_ALLOWED_ORIGINS` → the origin(s) the packaged Electron app is
  configured to call from (Electron apps typically use a custom scheme or
  `http://localhost:<port>` only in dev; in production the desktop app talks
  directly to your HTTPS API and CORS mostly matters for any admin web
  console you might add later)
- `NODE_ENV=production`

### Build & run

```bash
npm ci
npm run build --workspace=packages/shared
npm run build --workspace=packages/validation
npm run build --workspace=apps/server
cd apps/server
npm run prisma:migrate:deploy
npm run prisma:seed        # first deploy only — creates Super Admin + permission catalogue
node dist/index.js
```

Recommended: run behind a process manager (`pm2`, systemd) or as a
container. A minimal `Dockerfile` outline:

```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY . .
RUN npm ci && \
    npm run build --workspace=packages/shared && \
    npm run build --workspace=packages/validation && \
    npm run build --workspace=apps/server && \
    npx prisma generate --schema=apps/server/prisma/schema.prisma

FROM node:20-slim
WORKDIR /app
COPY --from=build /app .
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "apps/server/dist/index.js"]
```

### Reverse proxy / TLS

Put the API behind Nginx/Caddy/your cloud load balancer with a valid TLS
certificate — the desktop client's Electron `will-navigate`/CSP rules and
the Socket.IO client both expect `https://`/`wss://` in production
(`connect-src https: wss:` in the CSP set in `electron/main.ts`).

### Database migrations on deploy

Always run `prisma migrate deploy` (not `migrate dev`) in CI/CD — it applies
pending migrations without prompting and without generating new ones from
schema drift.

### Horizontal scaling note

The server is stateless except for the Socket.IO connection registry.
If you run multiple server instances behind a load balancer, add the
`@socket.io/redis-adapter` so realtime events (`stock:updated`,
`sale:created`, etc.) broadcast across all instances — a single-instance
deployment (fine for most single-region shoe store deployments) does not
need this.

## 2. Desktop client packaging & distribution

```bash
cd apps/desktop
# set VITE_API_BASE_URL to your production API URL before building
npm run build
npm run build:electron
```

Output installers land in `apps/desktop/release/`:
- Windows: NSIS `.exe` installer
- macOS: `.dmg`
- Linux: `.AppImage`

Distribute these to each store/branch machine. Consider code-signing
(Windows Authenticode / macOS notarization) for a smooth install experience
without SmartScreen/Gatekeeper warnings — this requires your own signing
certificates and is not configured by default in
`apps/desktop/electron-builder.json`.

### Auto-update (recommended, not included by default)

For a SaaS sold to many customers, wire up `electron-updater` against a
release feed (S3, GitHub Releases, or your own server) so store staff never
have to manually reinstall. This is a natural next step once you have a
release pipeline; it isn't included in this build to avoid taking a
dependency on a specific hosting choice.

## 3. Post-deploy checklist

- [ ] `curl https://your-api-domain/health` returns `{"status":"ok"}`
- [ ] Super Admin can log in and create a test tenant
- [ ] A Cashier on that tenant can complete a POS sale and it appears in
      Reports within seconds (validates realtime + reporting pipeline)
- [ ] Cross-tenant IDOR check: attempt to fetch another tenant's product ID
      while authenticated as a different tenant — must return `404`, not
      `403` or the actual data (see docs/API.md's security notes)
- [ ] Database backups are scheduled (see [BACKUP_RESTORE.md](BACKUP_RESTORE.md))
- [ ] `SUPER_ADMIN_PASSWORD` has been changed from any placeholder value
