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

**Recommended Tech Stack**

- Frontend: React + TypeScript + Vite
- UI: Mantine with strictly responsive layouts
- Offline storage: SQLite in the browser via OPFS (e.g., wa-sqlite)
- Sync model: Event-sourced sync using an append-only log and server-side merge
- Backend API: Node.js + TypeScript HTTP server (NestJS migration still planned, not started in code)
- Database: PostgreSQL for server-side event log and projections
- Auth: Username + passcode with role-based access control
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

**Documentation**

- Requirements: `docs/requirements.md`
- User stories: `docs/user_stories.md`
- Project plan: `docs/project_plan.md`
- API endpoints: `docs/api.md`
- Stack rationale: `AI_CONTEXT.md`
- Prisma usage: `docs/prisma.md`

**Status**

- Baseline date: March 10, 2026.
- Phase 0: mostly done (repo, standards, architecture docs, CI quality gates).
- Phase 1: partial (auth/RBAC, event model, event-first writes for people/materials/items/intake/sales, projection freshness metadata).
- Phase 2: done for sync spine tasks 1-6 (responsive web shell, OPFS SQLite `queued_event` + `sync_state`, push/ack/pull/status orchestration, merge/conflict detection, administrator conflict resolution, and audit/immutability validation endpoints plus checks).
- Phase 3: done. Tasks 1-7 are complete: person registry, multi-line intake, points ledger/balance view with negative-balance prevention on sales (`INSUFFICIENT_POINTS`), inventory status change/adjustment request workflows, sales checkout with FIFO inventory-batch linkage to sold status, procurement event capture with inventory batch additions, and administrator expense capture (`expense.recorded`) via queue-first sync flow.
- Coverage and quality: unit suites now include explicit coverage commands and enforced thresholds for web/api/shared configs.
- Phase 4: in progress. Task 1 is complete: administrator-only Materials Collected report (`GET /reports/materials-collected`) with grouped totals by day/material/location and default last-30-days filtering.
- Phase 5: not started for hardening/pilot-prep scope.

**Getting Started**

- Prereq: PostgreSQL running; set `DATABASE_URL` in `apps/api/.env` (see `docs/prisma.md`).
- From repo root: `npm install`, then `npm run prisma:migrate` and `npm run prisma:generate`.
- Install materialized views: `npm run projections:install`.
- Seed initial staff users: `npm run seed:staff`.
- Start API server: `npm run start:api`.
- Start web shell: `npm run start:web`.
- Tests: `npm run test:unit` (web/shared/api) and `npm run test:e2e`.
- Coverage: `npm run test:web:coverage`, `npm run test:api:coverage`, `npm run test:shared:coverage`.
