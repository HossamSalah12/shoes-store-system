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
- **App server**: [Render.com](https://render.com) — free Web Service, no
  card required. Supports long-running Node processes, which is what
  Socket.IO's persistent WebSocket connections need (unlike pure serverless
  platforms, which would break realtime sync).

### Step 1 — Create the free database on Neon
1. Sign up at [neon.tech](https://neon.tech) (email only, no card).
2. **Create a project** → note the connection string it gives you, e.g.:
   ```
   postgresql://user:password@ep-xxxx.region.aws.neon.tech/dbname?sslmode=require
   ```
   This full string is your `DATABASE_URL` — copy it as-is (it already
   includes `sslmode=require`, which Neon requires).

### Step 2 — Push the project to GitHub
Render deploys from a Git repository. Create a repo (public or private) and
push this project to it if you haven't already.

### Step 3 — Create the free Web Service on Render
Sign up at [render.com](https://render.com) (email only, no card) →
**New → Web Service** → connect your repo. Configure:
- **Root Directory**: leave blank (repo root)
- **Build Command**:
  ```
  npm install && npm run build --workspace=packages/shared && npm run build --workspace=packages/validation && npm run build --workspace=apps/server && npx prisma generate --schema=apps/server/prisma/schema.prisma
  ```
- **Start Command**:
  ```
  node apps/server/dist/index.js
  ```
- **Plan**: Free

### Step 4 — Environment variables
In the Web Service's **Environment** tab, add:
- `DATABASE_URL` → the Neon connection string from Step 1
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` → generate real random values (e.g. `openssl rand -base64 48`, run twice for two different values)
- `NODE_ENV=production`
- `CORS_ALLOWED_ORIGINS` → `http://localhost:5173` (your local Electron dev renderer, so your desktop app on your own machine is allowed to call this remote server)
- `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`
- `PORT` → Render sets this automatically; already read via `process.env.PORT` in `env.ts`, no action needed

### Step 5 — Run migrations and seed once
After the first successful deploy, open the Web Service's **Shell** tab in the Render dashboard and run:
```
cd apps/server
npx prisma migrate deploy
npm run prisma:seed
```

### Step 6 — Point the desktop app at it
In `apps/desktop/.env`:
```
VITE_API_BASE_URL=https://your-service-name.onrender.com
```
Restart `npm run dev:desktop`. No Electron/CSP changes are needed — the
CSP in `electron/main.ts` already allows `https:`/`wss:` connections in
both dev and production; it was only ever restrictive about *plain http*
localhost origins.

### What "free" actually costs you here (read this so nothing surprises you)
- **Render free Web Service spins down after ~15 minutes of inactivity**
  and takes 30–60 seconds to wake back up on the next request. The desktop
  app's API client has a 20-second timeout
  (`apps/desktop/src/api/client.ts`) — the very first request after idle
  may time out; just retry it once. This is expected free-tier behavior,
  not a bug.
- **Neon's free compute auto-suspends** similarly after a few idle minutes,
  with a much shorter wake-up (typically 1–2 seconds) — usually
  imperceptible.
- Neither of these ever expires, deletes your data, or asks for payment
  details. They are simply "pause when idle, resume on demand" — the
  standard shape of a genuinely free tier, not a countdown to a paywall.

### Alternative: Render's own free PostgreSQL (simpler, but time-limited)
If you'd rather keep everything in one dashboard and don't mind a hard
cutoff, Render also offers its own free PostgreSQL (**New → PostgreSQL** →
free plan) — copy its Internal/External Database URL as `DATABASE_URL`
instead of Neon's. The tradeoff: **Render deletes free databases after 90
days**. Fine for a short test; Neon is the better choice if this testing
phase might run longer or you don't want a deadline to think about.

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
