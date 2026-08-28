# Backup & Restore Guide

The entire system's state lives in PostgreSQL (the Electron desktop client
is stateless except for a single encrypted refresh token used for silent
re-login). Backing up the database is sufficient to back up the whole
system.

## Backups

### Ad-hoc logical backup

```bash
pg_dump "postgresql://shoes_admin:changeme@localhost:5432/shoes_store_db" \
  --format=custom \
  --file="shoes_store_backup_$(date +%Y%m%d_%H%M%S).dump"
```

`--format=custom` produces a compressed, restore-flexible dump (supports
selective table restore and parallel restore), which is preferable to plain
SQL for anything beyond a quick manual snapshot.

### Scheduled backups (example: daily cron)

```bash
# /etc/cron.d/shoes-store-backup
0 3 * * * postgres pg_dump "$DATABASE_URL" --format=custom --file=/backups/shoes_store_$(date +\%Y\%m\%d).dump
```

Retain at least 7 daily + 4 weekly + 3 monthly backups, stored somewhere
other than the database host itself (S3, another region, etc.).

### Managed PostgreSQL providers

If you're using RDS, Cloud SQL, Supabase, Neon, etc., prefer their built-in
automated snapshot + point-in-time-recovery features over manual `pg_dump`
for your primary safety net — use `pg_dump` as a supplementary, portable
backup you fully control.

## Restore

### Full restore to a fresh database

```bash
createdb -U shoes_admin shoes_store_db_restored
pg_restore --dbname="postgresql://shoes_admin:changeme@localhost:5432/shoes_store_db_restored" \
  --no-owner --no-privileges \
  shoes_store_backup_20260101_030000.dump
```

Point `DATABASE_URL` at `shoes_store_db_restored`, run
`npm run prisma:generate` to ensure the client matches the schema, and start
the server. Do **not** run `prisma migrate deploy`/`prisma migrate dev`
against a restored dump unless the dump predates a migration you need to
re-apply — a `pg_restore` from a dump taken after all your migrations
already contains the correct schema.

### Point-in-time recovery (PITR)

If your provider supports PITR (most managed providers do via WAL
archiving), prefer it over a logical dump when you need to recover to an
exact moment (e.g. "restore to 2 minutes before the bad delete") rather than
the last nightly snapshot.

### Restoring a single tenant only

Because every tenant-scoped table carries an explicit `tenantId`, you can
extract just one tenant's data with `pg_dump`'s `--table` flag plus a
`WHERE` filter via `psql \copy`, or more simply: restore the full dump to a
scratch database, then `INSERT ... SELECT ... WHERE "tenantId" = '...'`
into the target database. There's no cross-tenant referential dependency
that would complicate this (foreign keys are all `tenantId`-local or
platform-level like `Plan`).

## Verifying a backup is restorable

Periodically (e.g. monthly) actually restore the latest backup to a scratch
database and run:

```bash
psql "$SCRATCH_DATABASE_URL" -c "SELECT count(*) FROM \"Tenant\";"
psql "$SCRATCH_DATABASE_URL" -c "SELECT count(*) FROM \"Sale\";"
```

A backup you've never test-restored is not a backup you can rely on.

## What is NOT covered by a database backup

- Uploaded product images, if you later add file storage outside the
  database (e.g. S3) — back that up separately and keep it in sync.
- The `.env` secrets themselves (`JWT_ACCESS_SECRET`,
  `JWT_REFRESH_SECRET`, `DATABASE_URL`) — store these in your secret
  manager with its own backup/versioning, not in the database.
