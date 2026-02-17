# Project Plan

This plan sequences the work to deliver the Recycling Swap-Shop software described in `docs/requirements.md` and `docs/user_stories.md`. It is organized by phases with explicit dependencies and deliverables.

## Assumptions

- Offline-first PWA with event-sourced sync.
- Single codebase for web (laptops, tablets, phones).
- Small team (1-4 engineers). Timeline is expressed in weeks relative to project start.

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
2. Implement server-side event log (append-only) in PostgreSQL.
3. Implement projections for people, points balances, inventory, and reports.
4. Implement authentication and RBAC (collector, shop operator, manager).
5. Implement API skeleton for core entities (people, items, materials, ledger).

Deliverables

- Working API with authentication, event log, and baseline projections.

Dependencies

- Phase 0 complete.

---

## Phase 2: Offline-First Client + Sync (Weeks 4-6)

Goal: usable offline PWA with local storage and sync capability.

Tasks (in order)

1. Implement PWA shell and responsive layouts.
2. Add local SQLite (OPFS) with event log and projections on-device.
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
