# Database Setup Guide

This system uses **PostgreSQL** with **Prisma** as the ORM. Every command
below must be run on your own machine — the environment this project was
authored in has no network access and no PostgreSQL server, so none of this
has been executed yet.

## 1. Install PostgreSQL

- **macOS**: `brew install postgresql@16 && brew services start postgresql@16`
- **Ubuntu/Debian**: `sudo apt install postgresql postgresql-contrib`
- **Windows**: use the official installer from https://www.postgresql.org/download/windows/
- **Docker** (fastest for local dev):
  ```bash
  docker run --name shoes-postgres \
    -e POSTGRES_USER=shoes_admin \
    -e POSTGRES_PASSWORD=changeme \
    -e POSTGRES_DB=shoes_store_db \
    -p 5432:5432 -d postgres:16
  ```

## 2. Create the database and user (skip if you used the Docker command above)

```sql
CREATE USER shoes_admin WITH PASSWORD 'changeme';
CREATE DATABASE shoes_store_db OWNER shoes_admin;
GRANT ALL PRIVILEGES ON DATABASE shoes_store_db TO shoes_admin;
```

## 3. Configure the connection string

Copy `.env.example` to `apps/server/.env` and set `DATABASE_URL`:

```
DATABASE_URL=postgresql://shoes_admin:changeme@localhost:5432/shoes_store_db?schema=public
```

For a managed provider (RDS, Supabase, Neon, etc.) use the connection
string they give you, and make sure `sslmode=require` is appended if they
require TLS:

```
DATABASE_URL=postgresql://user:pass@host:5432/db?schema=public&sslmode=require
```

## 4. Generate the Prisma client

```bash
cd apps/server
npm run prisma:generate
```

## 5. Run migrations

Development (creates and applies a new migration, interactive):
```bash
npm run prisma:migrate
```

Production/CI (applies existing migrations only, non-interactive):
```bash
npm run prisma:migrate:deploy
```

The first migration will create every table described in
`apps/server/prisma/schema.prisma`: `Tenant`, `Plan`, `Subscription`,
`Branch`, `User`, `Role`/`Permission`/`RolePermission`/`UserRole`,
`UserBranch`, `Session`, `Brand`/`Category`/`Color`/`Size`,
`Product`/`ProductVariant`, `StockLevel`/`StockMovement`/`StockTransfer`,
`Supplier`/`Purchase`/`PurchaseItem`, `Customer`,
`Sale`/`SaleItem`/`Payment`/`Return`/`ReturnItem`, `Expense`, `Settings`,
`AuditLog`.

## 6. Seed the database

```bash
npm run prisma:seed
```

This will:
1. Insert the full permission catalogue (`Permission` rows matching
   `packages/shared/src/permissions.ts`).
2. Insert three default subscription plans (Starter/Growth/Enterprise).
3. Create the platform **Super Admin** account using
   `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` from your `.env`.
4. **Only if `SEED_DEMO_DATA=true`** is set in your environment: create two
   fully isolated demo tenants ("Hussein Shoes" with 3 branches, "Mohamed
   Shoes" with 4 branches) matching the acceptance-test scenario from the
   original spec, each with an Owner login (`Owner@12345`). This is opt-in
   so a real production seed never creates sample businesses.

## 7. Inspect the database (optional)

```bash
npm run prisma:studio
```
Opens Prisma Studio, a local GUI for browsing/editing rows — useful for
verifying tenant isolation manually (e.g. confirm Hussein's products never
show a `tenantId` matching Mohamed's tenant).

## Troubleshooting

- **`P1001: Can't reach database server`** — PostgreSQL isn't running, or
  `DATABASE_URL` host/port is wrong.
- **`P3009: migrate found failed migrations`** — a previous migration
  attempt failed partway; run `npx prisma migrate resolve` or reset your
  dev database with `npx prisma migrate reset` (⚠️ this drops all data,
  dev only).
- **Permission denied creating database** — make sure the Postgres user has
  `CREATEDB` or is the owner: `ALTER USER shoes_admin CREATEDB;`
