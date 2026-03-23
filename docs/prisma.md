# Prisma Usage Guide

Purpose: document how Prisma is used in `apps/api`, and when to run each command, so the schema and generated client stay in sync across development and CI.

## Commands

### `npm run prisma:generate`

Regenerates the TypeScript client for `@prisma/client`.

Run this:

- After any change to `apps/api/prisma/schema.prisma`
- After pulling schema changes from another branch

Why:

- Keeps typings in sync with the schema definition
- Refreshes the client consumed by the API code in `apps/api/src`

### `npm run prisma:migrate`

Creates and applies a new migration. The default name is `init`.

Use this when:

- You change the schema and want a versioned migration committed
- You need to apply all migrations to a fresh database

### `npm run prisma:studio`

Opens Prisma Studio against `DATABASE_URL` for quick inspection.

Notes:

- Dev-only
- Not required for CI

## Why This Matters

- Repeatable schema: migrations keep development, CI, and production aligned and catch drift early
- Type safety: the generated client reflects the current schema; stale clients cause runtime errors or missing fields
- Auditable changes: migrations are versioned in Git, so DB changes can be reviewed like the rest of the codebase

## Update Workflow

1. Edit `apps/api/prisma/schema.prisma`.
2. Run `npm run prisma:migrate -- --name <descriptive-name>` to create and apply a migration locally.
3. Run `npm run prisma:generate` to refresh the Prisma client.
4. Commit both the migration folder and the schema changes.
5. After pulling `main`, run `npm run prisma:migrate` and then `npm run prisma:generate`.

Example migration name:

- `add-person-index`

Current point storage rules:

- `MaterialType.pointsPerKg` is stored as a decimal and validated as a one-decimal-place point value in application code
- `Item.pointsPrice` is stored as `Decimal(10,1)`
- Event payload point values stay numeric in JSON and are normalized to one decimal place before persistence

## Environment

- Set `DATABASE_URL` in `apps/api/.env` before running any Prisma command
- The placeholder currently points to local Postgres; replace it with the actual connection string for your environment

## Keeping Things Healthy

- If Prisma reports that the schema or client is out of date, rerun `npm run prisma:generate`
- The current schema uses Prisma's default client output for `@prisma/client`; if an old `apps/api/src/generated/prisma` folder exists locally, treat it as stale generated output
- If migrations fail, inspect the error, fix the schema or data issue, and rerun
- Do not hand-edit database tables outside migrations
- In CI, run `npm run prisma:generate` before API builds or tests
- Run migrations in deployment pipelines for staging and production, with backups enabled
