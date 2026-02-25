# Prisma Usage Guide

Purpose: document how we use Prisma in `apps/api` and when to run each command so the schema and generated client stay in sync across dev/CI.

## Commands (npm scripts)
- `npm run prisma:generate` — regenerates the TypeScript client in `apps/api/src/generated/prisma`. Run after any change to `apps/api/prisma/schema.prisma` or after pulling schema changes. Keeps typings in sync with the DB schema definition.
- `npm run prisma:migrate` — creates and applies a new migration (name `init` by default). Use when you change the schema and want a versioned migration committed. Also run on a fresh DB to apply all migrations.
- `npm run prisma:studio` — opens Prisma Studio against the `DATABASE_URL` for quick inspection. Dev-only; not required for CI.

## Why this matters
- Repeatable schema: migrations keep every environment (dev, CI, prod) aligned and catch drift early.
- Type safety: generated client reflects the current schema; stale clients cause runtime errors or missing fields.
- Auditable changes: migrations are versioned files in git, making DB changes code-reviewed like the rest of the repo.

## Update workflow
1) Edit `apps/api/prisma/schema.prisma`.
2) Run `npm run prisma:migrate` with a descriptive `--name` (e.g., `--name add-person-index`) to produce a migration and apply it to your local DB.
3) Run `npm run prisma:generate` to refresh the client.
4) Commit both the migration folder and any schema changes. Generated client stays untracked via `.gitignore`.
5) After pulling main: run `npm run prisma:migrate` then `npm run prisma:generate` to sync local DB and client.

## Environment
- Set `DATABASE_URL` in `apps/api/.env` before running any Prisma command. The placeholder currently points to local Postgres; update to your real connection string.

## Keeping things healthy
- If Prisma reports “schema/client out of date”, rerun `npm run prisma:generate`.
- If migrations fail, inspect the error, fix the schema or data, and rerun. Do not hand-edit DB tables outside migrations.
- For CI: add `npm run prisma:generate` before API builds/tests; migrations should run in deployment pipelines against staging/prod with backups enabled.
