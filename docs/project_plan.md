# Project Plan

This plan sequences the work to deliver the Recycling Swap-Shop software described in `docs/requirements.md` and `docs/user_stories.md`. It is organized by phases with explicit dependencies and deliverables.

## Assumptions

- Offline-first PWA with event-sourced sync
- Single codebase for web across laptops, tablets, and phones
- Small team of `1-4` engineers
- Timeline expressed in weeks relative to project start
- Database: PostgreSQL with Prisma schema
- Projections implemented as materialized views refreshed after each accepted event write, which is the current behavior
- Inventory valuation uses a hybrid approach:
  - Total cost retained
  - Sellable value excludes spoiled, damaged, and missing stock
  - Losses tracked explicitly

If you want exact calendar dates, add the project start date and team size.

---

## Phase 0: Foundation (Week 1)

Goal: establish project scaffolding, architecture, and delivery pipeline.

### Tasks

1. Define repo structure: `apps/web`, `apps/api`, `packages/shared`
2. Confirm Mantine as the UI library and finalize stack choices
3. Set code standards: TypeScript config, lint, format, test tools
4. Set up CI for lint, test, and build, plus a basic release workflow
5. Create initial architecture docs for the event model, sync approach, and RBAC

### Deliverables

- Repo initialized with CI, linting, and baseline architecture docs

### Dependencies

- None

---

## Phase 1: Core Data Model + Auth (Weeks 2-3)

Goal: establish the domain model, event log, projections, and role-based auth.

### Tasks

1. Define core domain types and event schemas
2. Implement the server-side append-only event log in PostgreSQL via Prisma
3. Implement projections for people, points balances, inventory, and reports using materialized views and scheduled refresh
   Note: partially implemented; freshness gating enforcement was still pending as of `2026-03-05`
4. Implement authentication and RBAC for user and administrator
   Status: completed on `2026-03-04`
5. Implement the API skeleton for core entities such as people, items, materials, and ledger
   Status: completed on `2026-03-04`

### Deliverables

- Working API with authentication, event log, and baseline projections

### Dependencies

- Phase 0 complete

---

## Phase 2: Offline-First Client + Sync (Weeks 4-6)

Goal: usable offline PWA with local storage and sync capability.

### Tasks

1. Implement the PWA shell and responsive layouts
2. Add local SQLite via OPFS with queue and sync-state persistence
3. Build the sync protocol to push local events and pull remote events
4. Implement event merge rules and conflict detection
5. Add an administrator conflict resolution workflow
6. Validate audit trail preservation and immutability rules

### Deliverables

- Offline-first client with working sync and conflict flow

### Dependencies

- Phase 1 complete

---

## Phase 3: Core Workflows (Weeks 7-9)

Goal: deliver intake, points, inventory, sales, procurement, and expenses.

### Tasks

1. Person registry with create, search, edit, and hidden ID/phone display rules
2. Material intake with event creation, lines, points calculation, and ledger entry
   Note: point values are pegged to rand with one decimal place, and intake lines round down to the nearest `0.1`
3. Points ledger and balance view with negative-balance prevention
4. Inventory with items, batches, status changes, and adjustment requests
5. Sales with points-only checkout, ledger debit, and sold inventory status
6. Procurement with procurement events and inventory additions
7. Expenses for non-inventory cost entry

### Deliverables

- All core workflows usable offline and synced

### Dependencies

- Phase 2 complete

---

## Phase 4: Reporting + Exports (Weeks 10-11)

Goal: deliver required reports and export capabilities.

### Tasks

1. Materials collected report by type, location, and date
2. Points liability report by person and total
3. Inventory report by status with cost vs points value
4. Inventory status change log report
5. Sales report by item, location, and date
6. Cashflow report with points-as-rand vs expenses
7. Export functionality for reports in CSV or Excel

### Deliverables

- All required reports with filters and export

### Dependencies

- Phase 3 complete

---

## Phase 5: Hardening + Launch Prep (Weeks 12-13)

Goal: stabilize, secure, and prepare for pilot deployment.

### Tasks

1. Add data integrity checks and reconciliation tooling
2. Tune performance for low-end devices
3. Run a security review covering RBAC enforcement and data visibility rules
4. Define backup and disaster recovery procedures
5. Conduct field testing with real-world scenarios and offline sync
6. Prepare documentation and training materials for staff roles
7. Finalize the field deployment runbook covering the field-device workflow, tablet catalog refresh, and end-of-day sync controls

### Deliverables

- Pilot-ready build with documentation and operational readiness

### Dependencies

- Phase 4 complete

---

## Risk Register

### Top Risks

- Sync conflicts and merge edge cases
- Low-connectivity environments causing partial syncs
- Device storage constraints with large event logs
- Usability in field conditions such as small screens and intermittent power

### Mitigations

- Prototype sync and conflict flows early in Phase 2
- Define an archive strategy for old events while retaining audit logs
- Run regular field testing and usability checks

---

## Milestone Checklist

- `M1`: Architecture and CI ready by end of Week 1
- `M2`: Auth, event model, and projections working by end of Week 3
- `M3`: Offline PWA, sync, and conflict flow working by end of Week 6
- `M4`: Core workflows complete by end of Week 9
- `M5`: Reporting complete by end of Week 11
- `M6`: Pilot-ready release by end of Week 13

---

## Reality Check (`2026-03-12`)

| Area                                                        | Status | Notes                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0 foundation                                          | Done   | Repo, workspaces, lint, format, typecheck, architecture docs, and CI quality gates are in place.                                                                                                                                                                                                            |
| Event model and RBAC                                        | Done   | Domain events, shared types, and auth permissions are implemented.                                                                                                                                                                                                                                          |
| Event-first writes                                          | Done   | Append-only event-first writes are active across implemented workflows, including people, materials, items, intake, sales, inventory status changes, adjustment requests, procurement, and expenses.                                                                                                        |
| Sync protocol endpoints                                     | Done   | `POST /sync/push`, `GET /sync/pull`, `GET /sync/status`, `GET /sync/conflicts`, `POST /sync/conflicts/:id/resolve`, `GET /sync/audit/report`, and `GET /sync/audit/event/:eventId` are implemented.                                                                                                         |
| Web client shell                                            | Done   | Auth-gated Mantine shell, login/logout, Sync Now orchestration, sync status indicators, and the administrator conflict inbox and resolution panel are implemented.                                                                                                                                          |
| OPFS SQLite local store                                     | Done   | Queue state and sync cursor metadata persist in OPFS-backed SQLite via a web worker.                                                                                                                                                                                                                        |
| Audit and immutability checks                               | Done   | Audit report diagnostics and append-only event immutability guards are covered by automated tests.                                                                                                                                                                                                          |
| Coverage gates                                              | Done   | Web, API, and shared coverage commands exist with enforced Vitest and Jest thresholds for the current test scope.                                                                                                                                                                                           |
| Phase 3 Task 1: Person Registry                             | Done   | `PATCH /people/:personId` is implemented as an event-first update endpoint; the web registry supports create, search, edit, offline queueing, sync, and masked ID and phone display.                                                                                                                        |
| Phase 3 Task 2: Material Intake                             | Done   | Web intake supports multi-line `intake.recorded` event creation, deterministic line and total points previews, client preflight validation, queueing, sync submission, and ledger refresh after sync.                                                                                                       |
| Phase 3 Task 3: Points Ledger and Balance                   | Done   | Ledger balance and entries are available via API and web UI; the ledger auto-refreshes for the selected person, source event IDs are visible, and negative-balance sales are blocked with `409 INSUFFICIENT_POINTS`.                                                                                        |
| Phase 3 Task 4: Inventory Status and Requests               | Done   | API endpoints exist for inventory summary, batches, status changes, and adjustment requests; the web inventory panel queues `inventory.status_changed` and `inventory.adjustment_requested` events offline, syncs them, and refreshes inventory state.                                                      |
| Phase 3 Task 5: Sales Checkout and Sold Status              | Done   | `POST /sales` supports optional `inventoryBatchId` with server-side FIFO allocation and deterministic `INSUFFICIENT_STOCK` errors; the web sales panel queues `sale.recorded` events with batch-linked lines, syncs immediately, and refreshes ledger and inventory state.                                  |
| Phase 3 Task 6: Procurement and Inventory Additions         | Done   | `POST /procurements` is implemented with server-generated `inventoryBatchId` values per line and computed `cashTotal`; the web procurement panel queues `procurement.recorded` events offline, syncs immediately, and refreshes inventory state.                                                            |
| Phase 3 Task 7: Expenses                                    | Done   | `POST /expenses` appends immutable `expense.recorded` events; the web expense panel enqueues expense events offline-first, triggers immediate sync, and updates shell state with deterministic validation and error feedback.                                                                               |
| Phase 4 Task 1: Materials Collected Report                  | Done   | Administrator-only `GET /reports/materials-collected` and the matching web panel are implemented with filters for `fromDate`, `toDate`, `locationText`, and `materialTypeId`, plus daily grouping and default last-30-days behavior when dates are omitted.                                                 |
| Phase 4 Task 2: Points Liability Report                     | Done   | Administrator-only `GET /reports/points-liability` and the matching web panel are implemented with positive-balance-only rows, optional name/surname search, filtered summary totals, and one-decimal balance formatting.                                                                                   |
| Phase 4 Task 3: Inventory Report                            | Done   | Administrator-only `GET /reports/inventory-status` and the matching web panel are implemented with per-status cost totals, per-item detail rows, fixed status ordering, and zero-total summary statuses. Current implementation is cost-only; points valuation is deferred.                                 |
| Phase 4 Task 4: Inventory Status Change Log                 | Done   | Administrator-only `GET /reports/inventory-status-log` and the matching web panel are implemented with default last-30-days behavior, `fromDate`/`toDate`/`fromStatus`/`toStatus` filters, applied-only movement rows, and best-effort batch-to-item resolution.                                            |
| Phase 4 Task 5: Sales Report                                | Done   | Administrator-only `GET /reports/sales` and the matching web panel are implemented with day-plus-item-plus-location grouping, date/location/item filters, filtered summary totals, and one-decimal points formatting.                                                                                       |
| Phase 4 Task 6: Cashflow Report                             | Done   | Administrator-only `GET /reports/cashflow` and the matching web panel are implemented with daily sales-as-rand vs expense totals, date/location filters, filtered summary totals, and expense-category breakdowns.                                                                                          |
| Phase 4 Task 7: Report Exports                              | Done   | The web administrator reports UI can export the currently loaded materials, points-liability, inventory-status, inventory-status-log, sales, and cashflow report data to CSV files.                                                                                                                         |
| Phase 5 Task 1: Integrity Checks and Reconciliation Tooling | Done   | Administrator-only reconciliation tooling is implemented with `GET /sync/reconciliation/report`, `POST /sync/reconciliation/issues/:issueId/repair`, web issue review, administrator-confirmed repair notes, append-only corrective points and inventory adjustment events, and projection rebuild support. |
| Phase 5 Task 2: Low-End Device Performance Tuning           | Done   | Administrator report and reconciliation panels in the web shell now lazy-load on open instead of eager-loading on administrator login, reducing startup and render work on low-end devices while keeping core operational data eager.                                                                       |
| Phase 5 Task 3: Security Review and RBAC/Data Visibility    | Done   | Server-side permission checks now use an explicit `person.read` action for people listing, and standard person API responses mask ID number and phone values by default in list, create, and update flows.                                                                                                  |
| Phase 5 Task 4: Backup and Disaster Recovery                | Done   | A backup and recovery runbook now defines backup policy, restore validation, field-day outage handling, and recovery logging for the hosted PostgreSQL and web/API deployment.                                                                                                                              |
| Phase 5 Task 5: Field Testing Pack                          | Done   | A repo-backed field-testing pack now exists with a scenario matrix, execution sheet, and findings log for real-world pilot runs covering offline trading, intermittent sync, and same-day points behavior across user and administrator devices.                                                            |
| Phase 5 Task 6: Staff Role Documentation and Training       | Done   | Role-based training guides now cover user and administrator onboarding, shared field-day rules, practice scenarios, and trainer sign-off criteria.                                                                                                                                                          |
| Phase 5 Task 7: Launch and Deployment Runbook               | Done   | A launch runbook plus go-live and rollback checklists now define pre-launch prerequisites, deployment order, validation, pilot cutover, rollback execution, and release sign-off.                                                                                                                           |
| Reports and exports                                         | Done   | Phase 4 reporting now includes materials-collected, points-liability, sales, cashflow, inventory-status, inventory-status-log, and CSV export workflows across the implemented report panels.                                                                                                               |
| Field deployment guidance                                   | Done   | Low-connectivity field layout is documented with a dedicated architecture guide and ADR covering the two transactional phones, read-only tablet, sync windows, and same-day points operating rule.                                                                                                          |
| Hardening and pilot prep                                    | Done   | Phase 5 Tasks 1 through 7 are complete. The repo now includes recovery, field-testing, training, and launch documentation needed for pilot operational readiness.                                                                                                                                           |
