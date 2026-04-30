# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Offline-first PWA for a mobile recycling swap-shop. People bring recyclable materials, get points (1 point = 1 rand; intake line points are floored to the nearest 0.1, all other point values are normalized to one decimal place), and redeem points for shop items. The system tracks materials, points, inventory, procurement, expenses, and reporting via an immutable, event-sourced audit log.

Detailed background lives in `docs/` (`requirements.md`, `architecture/`, `operations/`, `api.md`, `prisma.md`).

`AI_CONTEXT.md` (repo root) documents the full tech stack rationale and must be consulted before architecture or data-model decisions.

## Architecture

Monorepo with npm workspaces — `apps/*` and `packages/*`.

- **`apps/web`** — React + TypeScript + Vite + Mantine PWA. UI must be strictly responsive (laptop / tablet / phone).
- **`apps/api`** — Node.js + TypeScript HTTP server (`http.createServer` in `apps/api/src/http/server.ts` — NestJS migration is planned but not started). Composition root is `apps/api/src/index.ts` → `startApiServer`. Port from `API_PORT` (default 3001), requires `AUTH_SECRET`. Centralized error logging writes to `API_ERROR_LOG_PATH` (default `/var/log/swapshop-api/app-error.log`) with truncation at `API_ERROR_LOG_MAX_BYTES` (default 5 MiB) — see `apps/api/src/http/error-logger.ts`.
- **`packages/shared`** — Domain types, event schemas, point arithmetic, validation, sync types. Both `web` and `api` import directly from `packages/shared/src/...` via relative paths (no path aliases configured).

### Auth & Hosting

- Auth: username + passcode. Role-based access enforced server-side in the API **and** in the UI.
- Hosting target: Linux VM or managed platform.
- ID numbers and phone numbers must not display in standard interactions — any reveal is role-gated (see also Project Conventions).

### Event-sourced sync

Everything that changes points, inventory, or money is an immutable event. **Never mutate or delete events.** Corrections are new `*.adjustment_requested` / `*.adjustment_applied` events.

- **Server** stores the canonical append-only event log in PostgreSQL via Prisma (`apps/api/prisma/schema.prisma`). The `Event` table is keyed by client-generated `eventId` (idempotent on re-push). Read models are Postgres materialized views (`apps/api/prisma/projections.sql`) refreshed by `apps/api/src/projections/refresh.ts` after each accepted write. Server-side merge/conflict logic lives in `apps/api/src/data/sync-merge-policy.ts`; the orchestration entry point is `apps/api/src/data/core-repository.ts`.
- **Client** queues events in OPFS SQLite (`wa-sqlite`) via `apps/web/src/offline/event-queue-sqlite.ts` and tracks the server cursor in `sync-state-sqlite.ts`. Sync flow (push batched ≤100 → ack accepted/duplicate → pull since cursor → status) lives in `apps/web/src/offline/sync-client.ts` and the `useSync` hook. Sync triggers: explicit "Sync Now" plus action triggers after person/intake/sales/inventory/adjustment enqueue.
- Event envelope and naming convention: see `docs/architecture/event_model.md`. Event types are a Postgres enum mapped to dotted names like `intake.recorded`.

### Points arithmetic

Point values must always go through `packages/shared/src/domain/points.ts` helpers (`normalizePointValue`, `floorPointsToTenths`, `sumPointValues`, `multiplyPointValue`, `comparePointValues`). They are stored as `Decimal(10,1)` in Postgres and normalized to one decimal place before persistence. Sales must reject when a balance would go negative (`INSUFFICIENT_POINTS`).

## Common Commands

Run from repo root. Node `>=22.18.0` (see `.nvmrc`), npm `11.10.0`.

### Environment

Create `apps/api/.env` with at minimum:

```
DATABASE_URL=postgresql://user:pass@localhost:5432/swapshop
AUTH_SECRET=<random-secret>
```

Optional overrides: `API_PORT` (default 3001), `API_ERROR_LOG_PATH`, `API_ERROR_LOG_MAX_BYTES`.

### Setup

```bash
npm install
npm run prisma:migrate          # creates+applies migrations against DATABASE_URL in apps/api/.env
npm run prisma:generate         # refresh Prisma client after schema changes
npm run projections:install     # install Postgres materialized views
npm run seed:staff              # seed initial staff users
```

### Dev servers

```bash
npm run start:api               # tsx apps/api/src/start.ts (requires AUTH_SECRET)
npm run start:web               # vite dev server, default http://localhost:5173
```

### Build

```bash
npm run build:web                 # vite production build
npm run build:api                 # tsc compile to apps/api/dist/
```

### Tests

`test:unit` runs web (Vitest) → shared (Vitest) → api (Jest). `test:api` and `test:web` auto-run `prisma:generate` first.

```bash
npm run test                              # full unit + e2e
npm run test:unit                         # all three unit suites
npm run test:web                          # apps/web Vitest
npm run test:web:watch
npm run test:web:coverage
npm run test:shared                       # packages/shared Vitest
npm run test:api                          # apps/api Jest
npm run test:api:coverage
npm run test:e2e                          # Playwright (chromium + mobile-chrome)
```

Single-test invocations:

```bash
npx vitest run --config apps/web/vitest.config.ts <path-or-pattern>
npx vitest run --config apps/web/vitest.config.ts -t "<test name>"
npx jest --config apps/api/jest.config.cjs <path-or-pattern>
npx jest --config apps/api/jest.config.cjs -t "<test name>"
npx playwright test tests/e2e/happy-path.spec.ts -g "<test name>"
```

### Quality gates

```bash
npm run typecheck                # tsc on web + api + shared (after prisma:generate)
npm run lint                     # eslint . (also runs prisma:generate)
npm run lint:fix
npm run format                   # prettier --check
npm run format:write
```

A Husky `pre-commit` hook runs `lint-staged` on changed files.

## Project Conventions (non-negotiable, from `AGENTS.md`)

See also the "Four principles to code by" section in `AGENTS.md`: Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution.

- TDD required: write the failing test first; bug fixes need a regression test.
- No class-based services, no global mutable state, no default exports, no `any`, no implicit returns.
- TypeScript is strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `useUnknownInCatchVariables` — see `tsconfig.base.json`).
- Use domain types from `packages/shared/src/domain` for IDs and enums.
- Prefer typed columns for projections; reserve JSONB for genuinely fluid payloads.
- ID numbers and phone numbers are stored but must not display in standard interactions — any reveal is role-gated.

## Prisma workflow

After editing `apps/api/prisma/schema.prisma`:

1. `cd apps/api && npx prisma migrate dev --name <descriptive-name>`
2. `npm run prisma:generate`
3. Commit both the migration folder and the schema.

After pulling `main`: rerun `prisma:migrate` then `prisma:generate`. See `docs/prisma.md` for full guidance.

Other useful commands:

- `npm run prisma:migrate:deploy` — production (no prompts, runs pending migrations)
- `npm run prisma:studio` — Prisma Studio GUI for browsing data
