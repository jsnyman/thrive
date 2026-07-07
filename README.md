# Recycling Swap-Shop Software

Offline-first software for a mobile recycling swap-shop that moves between villages. People bring recyclable materials, materials are weighed and credited as points, and points are redeemed for shop items. The system tracks materials, points, inventory, procurement, expenses, and reporting with a full audit trail.

**Goals**

- Support work without connectivity on laptops, cellphones, and tablets.
- Keep points and inventory accurate with immutable, auditable event logs.
- Enable role-based workflows for users and administrators.

**Primary Users**

- User: person registration and intake events
- User: points-only sales
- Administrator: inventory, procurement, expenses, reporting, and adjustments

**Core Workflows**

- Register a person and maintain a points ledger
- Record material intake and award points (1 point = 1 rand, rounded down)
- Record points-only sales and deduct balances
- Manage inventory statuses and adjustments
- Record procurement and expenses
- Run reports for materials, points liability, inventory, sales, and cashflow

**Key Business Rules**

- No negative point balances.
- Points are pegged to currency with no cents (rounded down).
- ID numbers and phone numbers are stored but not displayed during interactions.
- All financial and points-related changes are immutable events.
- Adjustments require a logged request and administrator approval.

**Tech Stack (as implemented)**

- Frontend: React + TypeScript + Vite, single-page app shell in `apps/web/src/App.tsx` (no client-side router; navigation is view-state driven)
- UI: Mantine with strictly responsive layouts
- Offline storage: SQLite in the browser via OPFS, with a local event queue and sync engine under `apps/web/src/offline/`
- Sync model: Event-sourced sync using an append-only log and server-side merge (`apps/api/src/data/sync-merge-policy.ts`)
- Backend API: Node.js + TypeScript, a hand-rolled HTTP server with manual route dispatch (`apps/api/src/http/server.ts`) over a single repository module (`apps/api/src/data/core-repository.ts`); **NestJS is listed as a dependency but not used** — there are no Nest modules/controllers/services in the codebase
- Database: PostgreSQL for the append-only event log, accessed via Prisma (`apps/api/prisma/schema.prisma`); read models are Postgres materialized views (`apps/api/prisma/projections.sql`), not Prisma-managed tables
- Auth: Username + passcode with role-based access control enforced server-side (`apps/api/src/auth/permissions.ts`)
- Hosting: Linux VM or managed platform

**Architecture Notes**

- Offline-first PWA to support intermittent connectivity.
- Append-only event log retained indefinitely, with projections for reporting.
- Conflicts are flagged for administrator review and resolutions are logged.

**Roadmap**

1. Person registry, intake events, and points ledger (offline-first)
2. Inventory and points-only sales
3. Procurement and expense tracking
4. Reporting and exports
5. Sync conflict handling polish and audit reporting

**API Endpoints (summary)**

All endpoints below require `Authorization: Bearer <token>` unless noted; full request/response shapes, error codes, and query params are in `docs/api.md`.

| Area                | Endpoints                                                                                                                                                                                                                                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth                | `POST /auth/login`, `GET /auth/me`                                                                                                                                                                                                                                                                                            |
| People              | `GET /people`, `POST /people`, `PATCH /people/:personId`, `POST /people/:personId/remove` (admin)                                                                                                                                                                                                                             |
| Materials           | `GET /materials`, `POST /materials` (admin)                                                                                                                                                                                                                                                                                   |
| Items               | `GET /items`, `POST /items` (admin)                                                                                                                                                                                                                                                                                           |
| Inventory           | `GET /inventory/status-summary`, `GET /inventory/batches`, `POST /inventory/status-changes` (admin), `POST /inventory/adjustments/requests`                                                                                                                                                                                   |
| Ledger              | `GET /ledger/:personId/balance`, `GET /ledger/:personId/entries`                                                                                                                                                                                                                                                              |
| Intake (collection) | `POST /intakes`                                                                                                                                                                                                                                                                                                               |
| Sales               | `POST /sales`                                                                                                                                                                                                                                                                                                                 |
| Procurement         | `GET /procurements` (admin), `POST /procurements` (admin), `POST /procurements/bulk` (admin), `POST /procurements/:procurementEventId/corrections` (admin)                                                                                                                                                                    |
| Expenses            | `POST /expenses` (admin)                                                                                                                                                                                                                                                                                                      |
| Reports             | `GET /reports/materials-collected`, `GET /reports/points-liability`, `GET /reports/sales`, `GET /reports/cashflow`, `GET /reports/inventory-status`, `GET /reports/inventory-status-log` (all admin)                                                                                                                          |
| Adjustments         | `GET /adjustments/requests`, `POST /points/adjustments/apply` (admin), `POST /inventory/adjustments/apply` (admin)                                                                                                                                                                                                            |
| Users               | `GET /users` (admin), `POST /users` (admin), `PATCH /users/:userId` (admin)                                                                                                                                                                                                                                                   |
| Sync                | `POST /sync/push`, `GET /sync/pull`, `GET /sync/status`, `GET /sync/conflicts` (admin), `POST /sync/conflicts/:conflictId/resolve` (admin), `GET /sync/audit/report` (admin), `GET /sync/audit/event/:eventId` (admin), `GET /sync/reconciliation/report` (admin), `POST /sync/reconciliation/issues/:issueId/repair` (admin) |

Note: there is currently no Collection Point / Location endpoint group — this is planned work, see `docs/tmp/20260707-ui-changes-project-plan1.md`.

**Documentation**

- Requirements: `docs/requirements.md`
- User stories: `docs/user_stories.md`
- Project plan: `docs/project_plan.md`
- API endpoints (full detail): `docs/api.md`
- Architecture docs index: `docs/architecture/README.md`
- Stack rationale: `AI_CONTEXT.md`
- Prisma usage: `docs/prisma.md`

**Status**

- Snapshot date: April 19, 2026. See `docs/project_plan.md` Reality Check for the canonical per-task table; this section is a one-line summary per phase.
- Phase 0 — Foundation: done.
- Phase 1 — Auth/RBAC, event model, event-first writes, projection freshness: done.
- Phase 2 — Sync spine (web shell, OPFS SQLite, push/ack/pull/status, merge/conflict detection, administrator conflict resolution, audit/immutability checks): done.
- Phase 3 — Core workflows (person registry, intake, ledger with `INSUFFICIENT_POINTS` block, inventory status & requests, FIFO sales, procurement, expenses): done.
- Phase 4 — Reporting (materials collected, points liability, sales, cashflow, inventory status, inventory status log, CSV exports): done.
- Phase 5 — Hardening & pilot prep (reconciliation tooling, low-end perf tuning, security/RBAC review with masked PII, backup runbook, field testing pack, training material, launch runbook): done.
- Coverage and quality: unit suites have explicit coverage commands and enforced thresholds; see `apps/api/jest.config.cjs` and the two `vitest.config.ts` files for current numbers.

**Getting Started**

- Prereq: PostgreSQL running; set `DATABASE_URL` in `apps/api/.env` (see `docs/prisma.md`).
- From repo root: `npm install`, then `npm run prisma:migrate` and `npm run prisma:generate`.
- Install materialized views: `npm run projections:install`.
- Seed initial staff users: `npm run seed:staff`.
- Start API server: `npm run start:api`.
- Start web shell: `npm run start:web`.
- Tests: `npm run test:unit` (web/shared/api) and `npm run test:e2e`.
- Coverage: `npm run test:web:coverage`, `npm run test:api:coverage`, `npm run test:shared:coverage`.
