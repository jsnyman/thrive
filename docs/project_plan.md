# Project Plan

This plan sequences the work to deliver the Recycling Swap-Shop software described in `docs/requirements.md` and `docs/user_stories.md`. It is organized by phases with explicit dependencies and deliverables.

## Assumptions

- Offline-first PWA with event-sourced sync.
- Single codebase for web (laptops, tablets, phones).
- Small team (1-4 engineers). Timeline is expressed in weeks relative to project start.
- Database: PostgreSQL with Prisma schema; projections implemented as materialized views refreshed after each accepted event write (current behavior).
- Inventory valuation: hybrid approach (total cost retained; sellable excludes spoiled/damaged/missing; losses tracked explicitly).

If you want exact calendar dates, add the start date and team size.

---

## Phase 0: Foundation (Week 1)

Goal: establish project scaffolding, architecture, and delivery pipeline.

Tasks (in order)

1. Define repo structure (apps/web, apps/api, packages/shared).
2. Confirm Mantine as the UI library and finalize stack choices.
3. Set code standards (TypeScript config, lint, format, test tools).
4. Set up CI (lint, test, build) and basic release workflow.
5. Create initial architecture docs (event model, sync approach, RBAC).

Deliverables

- Repo initialized with CI, linting, and baseline architecture docs.

Dependencies

- None.

---

## Phase 1: Core Data Model + Auth (Weeks 2-3)

Goal: establish the domain model, event log, projections, and role-based auth.

Tasks (in order)

1. Define core domain types and event schemas.
2. Implement server-side event log (append-only) in PostgreSQL via Prisma.
3. Implement projections for people, points balances, inventory, and reports using materialized views and scheduled refresh. (Partial: implemented; freshness gating enforcement still pending as of March 5, 2026)
4. Implement authentication and RBAC (collector, shop operator, manager). (Completed on March 4, 2026)
5. Implement API skeleton for core entities (people, items, materials, ledger). (Completed on March 4, 2026)

Deliverables

- Working API with authentication, event log, and baseline projections.

Dependencies

- Phase 0 complete.

---

## Phase 2: Offline-First Client + Sync (Weeks 4-6)

Goal: usable offline PWA with local storage and sync capability.

Tasks (in order)

1. Implement PWA shell and responsive layouts.
2. Add local SQLite (OPFS) queue + sync-state persistence on-device.
3. Build sync protocol (push local events, pull remote events).
4. Implement event merge rules and conflict detection.
5. Add conflict resolution workflow for managers.
6. Validate audit trail preservation and immutability rules.

Deliverables

- Offline-first client with working sync and conflict flow.

Dependencies

- Phase 1 complete.

---

## Phase 3: Core Workflows (Weeks 7-9)

Goal: deliver intake, points, inventory, sales, procurement, and expenses.

Tasks (in order)

1. Person registry (create/search/edit) with hidden ID/phone display rules.
2. Material intake: event creation, lines, points calculation, ledger entry.
3. Points ledger and balance view with negative balance prevention.
4. Inventory: items, batches, status changes, and adjustment requests.
5. Sales: points-only checkout, ledger debit, inventory sold status.
6. Procurement: create procurement events and inventory additions.
7. Expenses: non-inventory expenses entry.

Deliverables

- All core workflows usable offline and synced.

Dependencies

- Phase 2 complete.

---

## Phase 4: Reporting + Exports (Weeks 10-11)

Goal: deliver required reports and export capabilities.

Tasks (in order)

1. Materials collected report by type/location/date.
2. Points liability report (per person + total).
3. Inventory report by status with cost vs points value.
4. Inventory status change log report.
5. Sales report by item/location/date.
6. Cashflow report (points as rand vs expenses).
7. Export functionality (CSV/Excel) for reports.

Deliverables

- All required reports with filters and export.

Dependencies

- Phase 3 complete.

---

## Phase 5: Hardening + Launch Prep (Weeks 12-13)

Goal: stabilize, secure, and prepare for pilot deployment.

Tasks (in order)

1. Data integrity checks and reconciliation tooling.
2. Performance tuning for low-end devices.
3. Security review (RBAC enforcement, data visibility rules).
4. Backup and disaster recovery procedures.
5. Field testing with real-world scenarios and offline sync.
6. Documentation and training materials for staff roles.

Deliverables

- Pilot-ready build with documentation and operational readiness.

Dependencies

- Phase 4 complete.

---

## Risk Register (Top Items)

- Sync conflicts and merge edge cases.
- Low-connectivity environments causing partial syncs.
- Device storage constraints with large event logs.
- Usability in field conditions (small screens, intermittent power).

Mitigations

- Early prototype of sync and conflict flows (Phase 2).
- Archive strategy for old events while retaining audit logs.
- Regular field testing and usability checks.

---

## Milestone Checklist

- M1: Architecture + CI ready (end Week 1)
- M2: Auth + event model + projections working (end Week 3)
- M3: Offline PWA + sync + conflict flow (end Week 6)
- M4: Core workflows complete (end Week 9)
- M5: Reporting complete (end Week 11)
- M6: Pilot-ready release (end Week 13)

---

## Reality Check (March 8, 2026)

| Area                                               | Status      | Notes                                                                                                                                                                                                                                                                        |
| -------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0 foundation                                 | Done        | Repo/workspaces, lint/format/typecheck, architecture docs, CI quality gates.                                                                                                                                                                                                 |
| Event model and RBAC                               | Done        | Domain events/types and auth permissions implemented.                                                                                                                                                                                                                        |
| Event-first writes                                 | Done        | Event-first append-only writes are active across implemented workflows, including people/materials/items, intake, sales, inventory status/adjustment requests, procurement, and expenses.                                                                                    |
| Sync protocol endpoints                            | Done        | `POST /sync/push`, `GET /sync/pull`, `GET /sync/status`, `GET /sync/conflicts`, `POST /sync/conflicts/:id/resolve`, `GET /sync/audit/report`, and `GET /sync/audit/event/:eventId` implemented.                                                                              |
| Web client shell                                   | Done        | Auth-gated Mantine shell implemented with login/logout, Sync Now orchestration, sync status indicators, and manager conflict inbox/resolution panel.                                                                                                                         |
| OPFS SQLite local store                            | Done        | Queue and sync cursor/last-sync state persist in OPFS-backed SQLite via web worker.                                                                                                                                                                                          |
| Audit/immutability checks                          | Done        | Audit report diagnostics and append-only event immutability guards validated by automated tests.                                                                                                                                                                             |
| Coverage gates                                     | Done        | Web/API/shared coverage commands added with enforced thresholds in Vitest/Jest configs for current test scope.                                                                                                                                                               |
| Phase 3 Task 1 (Person Registry)                   | Done        | `PATCH /people/:personId` event-first update endpoint implemented; web registry create/search/edit flow uses offline queue + sync and masks ID/phone in interaction views.                                                                                                   |
| Phase 3 Task 2 (Material Intake)                   | Done        | Web intake supports multi-line `intake.recorded` event creation, deterministic per-line/total points previews, client preflight validation, queue+sync submission, and ledger refresh after sync.                                                                            |
| Phase 3 Task 3 (Points Ledger + Balance)           | Done        | Ledger balance/entries are available via API and web UI, ledger now auto-refreshes for selected person, source event IDs are visible, and negative-balance sales are blocked with `409 INSUFFICIENT_POINTS`.                                                                 |
| Phase 3 Task 4 (Inventory Status + Requests)       | Done        | API endpoints added for inventory summary/batches and status change/adjustment requests; web inventory panel queues `inventory.status_changed` and `inventory.adjustment_requested` events offline, syncs, and refreshes inventory state.                                    |
| Phase 3 Task 5 (Sales Checkout + Sold Status)      | Done        | `POST /sales` now supports optional `inventoryBatchId` with server-side FIFO batch allocation and deterministic `INSUFFICIENT_STOCK` errors; web sales panel queues `sale.recorded` events with batch-linked lines, syncs immediately, and refreshes ledger/inventory state. |
| Phase 3 Task 6 (Procurement + Inventory Additions) | Done        | `POST /procurements` manager endpoint implemented with server-generated `inventoryBatchId` per line and computed `cashTotal`; web procurement panel queues `procurement.recorded` events offline, syncs immediately, and refreshes inventory state.                          |
| Phase 3 Task 7 (Expenses)                          | Done        | `POST /expenses` manager endpoint implemented to append immutable `expense.recorded` events; web expense panel enqueues expense events offline-first, triggers immediate sync, and updates shell state with deterministic validation/error feedback.                         |
| Reports/exports                                    | Not started | No report endpoints/UI yet.                                                                                                                                                                                                                                                  |
| Hardening/pilot prep                               | Not started | Security review, backup/DR, and field testing not started.                                                                                                                                                                                                                   |
