# Recycling Swap-Shop Software

Offline-first software for a mobile recycling swap-shop that moves between villages. People bring recyclable materials, materials are weighed and credited as points, and points are redeemed for shop items. The system tracks materials, points, inventory, procurement, expenses, and reporting with a full audit trail.

**Goals**

- Support work without connectivity on laptops, cellphones, and tablets.
- Keep points and inventory accurate with immutable, auditable event logs.
- Enable role-based workflows for collectors, shop operators, and managers.

**Primary Users**

- Collector: person registration and intake events
- Shop operator: points-only sales
- Manager: inventory, procurement, expenses, reporting, and adjustments

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
- Adjustments require a logged request and manager approval.

**Recommended Tech Stack**

- Frontend: React + TypeScript + Vite
- UI: Mantine with strictly responsive layouts
- Offline storage: SQLite in the browser via OPFS (e.g., wa-sqlite)
- Sync model: Event-sourced sync using an append-only log and server-side merge
- Backend API: Node.js + NestJS (or FastAPI if the team prefers Python)
- Database: PostgreSQL for server-side event log and projections
- Auth: Username + passcode with role-based access control
- Hosting: Linux VM or managed platform

**Architecture Notes**

- Offline-first PWA to support intermittent connectivity.
- Append-only event log retained indefinitely, with projections for reporting.
- Conflicts are flagged for manager review and resolutions are logged.

**Roadmap**

1. Person registry, intake events, and points ledger (offline-first)
2. Inventory and points-only sales
3. Procurement and expense tracking
4. Reporting and exports
5. Sync conflict handling polish and audit reporting

**Documentation**

- Requirements: `docs/requirements.md`
- User stories: `docs/user_stories.md`
- Project plan: `basic_plan.md`
- Stack rationale: `AI_CONTEXT.md`

**Status**

- Planning and requirements complete.
- Implementation has not started yet.

**Getting Started**

- No build or runtime instructions yet. See the documentation above for scope and requirements.
- Setup steps will be added once the codebase is initialized.
