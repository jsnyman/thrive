# Recycling Swap-Shop Software

Detailed Requirements (v1)

Last updated: 2026-02-02

---

Overview

The system supports a mobile recycling swap-shop that moves between villages. People bring recyclable materials to collection points. Materials are inspected, weighed, and credited as points. Points are pegged to currency: 1 point = 1 rand, rounded down to whole rand. People spend points to buy shop items. The system also tracks stock, procurement, expenses, and reporting. The system is multi-user, offline-first, and syncs asynchronously with event-log merge and audit.

---

1. Scope

In scope - Person registration and identification - Material intake, inspection, weighing, and point crediting - Points ledger and balance tracking - Inventory management for shop stock (storage, shop, sold, spoiled, damaged, missing) - Procurement and expense tracking - Points-only sales - Reporting for materials, points, inventory, cash, and expenses - Offline-first operation with asynchronous sync and audit trail

Out of scope (initially)

    - Fixed list of locations
    - Advanced analytics or forecasting
    - Point for cash

---

2. Users and Roles

2.1 Staff users - Authenticated by username + passcode - Roles: - Collector: intake, person registration - Shop operator: sales - Manager: procurement, expenses, reporting, administration

2.2 Persons (community members) - Identified by name + surname - Optional: ID number and phone number - Optional: address and notes - Unique internal system ID required

---

3. Business Rules

3.1 Points and currency - 1 point = 1 Rand - No cents; points awarded are rounded down to whole Rand - Points can only be spent on items, not exchanged for cash - Negative point balances are not allowed

3.2 Locations - Free-form text on all events (no fixed master list)

3.3 Inventory - Stock status must be tracked as storage, shop, sold, spoiled, damaged, or missing - Sales decrease stock immediately - Status changes must be logged with reason and staff user - Only managers can perform inventory adjustments, including damage, spoilage, or missing

3.4 Auditability - All financial and points-related changes must be recorded as immutable events - Sync uses event-log merge with audit trails - Event logs are retained indefinitely (initially) - Overlapping edits are flagged for manager resolution - ID numbers and phone numbers must not be displayed during interactions

---

4. Functional Requirements

4.1 Authentication and access control - FR-1: Staff users must log in using username + passcode - FR-2: Role-based permissions must restrict access to relevant actions

4.2 Person registry - FR-3: Users can register a new person with name and surname - FR-4: Users can add optional ID number, phone, address, and notes - FR-5: Users can search and select existing persons - FR-5a: ID numbers and phone numbers must not be displayed during interactions

4.3 Material intake and points - FR-6: Users can create an intake event with date/time and location - FR-7: Users can add one or more material lines with type and weight - FR-8: Points are calculated per line as (weight \* points_per_kg), rounded down to whole rand - FR-9: The system credits points to the person via the points ledger - FR-10: The system stores a full record of accepted materials and points awarded

4.4 Points ledger - FR-11: The system must maintain a ledger of point credits and debits - FR-12: Each ledger entry must reference its source event - FR-13: The system must show current point balance for a person - FR-13a: The system must block transactions that would result in a negative balance - FR-13b: Only managers can perform point adjustments - FR-13c: Non-managers can log a point adjustment request with a free-text reason

4.5 Inventory and stock - FR-14: Users can create items with points price and cost price - FR-15: Stock must be tracked with status: storage, shop, sold, spoiled, damaged, missing - FR-16: Users can move stock between storage and shop - FR-16a: Users can record status changes for partial quantities (spoiled, damaged, missing) - FR-16b: Each status change must record date/time, staff user, quantity, and a free-text reason - FR-16c: Only managers can perform inventory adjustments, including spoiled, damaged, or missing - FR-16d: Non-managers can log an inventory adjustment request with a free-text reason

4.6 Sales (points only) - FR-17: Users can record a sale using points only - FR-18: Sales must debit the person's point balance - FR-19: Sales must reduce stock and record sold status

4.7 Procurement - FR-20: Users can record procurement events with date, location, supplier (optional) - FR-21: Procurement lines must store item, quantity, and unit cost - FR-22: Procurement must increase stock and create cost basis - FR-23: Procurement can record trip distance for cost tracking

4.8 Expenses - FR-24: Users can record non-inventory expenses with category and amount - FR-25: Expenses must be included in reporting

4.9 Reporting - FR-26: Materials collected report by type/location/date - FR-27: Points liability report by person and total - FR-28: Inventory report by status and value (cost vs points), including spoiled, damaged, and missing - FR-28a: Inventory status change report by batch, date, and reason - FR-29: Sales report by item/location/date - FR-30: Cashflow report: sales value (points as rand) vs expenses

4.10 Sync and audit - FR-31: The system must work offline and queue events - FR-32: The system must sync asynchronously between devices - FR-33: Conflicts must be resolved by event-log merge with audit history - FR-33a: Overlapping edits must be flagged for manager review - FR-33b: Manager resolutions must be logged with a free-text reason

---

5. Non-Functional Requirements
   - NFR-1: Offline-first operation for all core workflows
   - NFR-2: Sync must tolerate intermittent connectivity
   - NFR-3: All events must be timestamped and attributable to a staff user
   - NFR-4: Data integrity must be maintained across sync
   - NFR-5: UI must be usable in low-connectivity, mobile contexts
   - NFR-6: Event logs must be retained indefinitely (initially)
   - NFR-7: ID numbers and phone numbers must not be displayed during interactions

---

6. Data Model (Logical)
   - User: id, username, passcode_hash, role
   - Person: id, name, surname, id_number?, phone?, address?, notes?
   - MaterialType: id, name, points_per_kg
   - IntakeEvent: id, date_time, location, staff_user_id, person_id
   - IntakeLine: intake_event_id, material_type_id, weight_kg, points_awarded
   - PointsLedger: id, person_id, date_time, location, delta_points, source_type, source_id
   - Item: id, name, points_price, cost_price, sku
   - InventoryBatch: id, item_id, qty, status, location, acquisition_type, acquisition_id
   - InventoryStatusChange: id, inventory_batch_id, date_time, staff_user_id, from_status, to_status, quantity, reason (free text), notes?
   - AdjustmentRequest: id, request_type (points/inventory), entity_ref, quantity?, reason (free text), requested_by, requested_at, status, resolved_by?, resolved_at?, resolution_notes?
   - SaleEvent: id, date_time, location, staff_user_id, person_id
   - SaleLine: sale_event_id, item_id, qty, points_price
   - ProcurementEvent: id, date_time, location, supplier?, trip_distance_km?, cash_total
   - ProcurementLine: procurement_event_id, item_id, qty, unit_cost
   - Expense: id, date_time, location, category, cash_amount, notes, receipt_ref?

---

7. MVP Phases

Phase 1 - Person registry - Intake events and points ledger - Offline-first storage

Phase 2 - Inventory and points-only sales

Phase 3 - Procurement and expense tracking

Phase 4 - Reporting and exports

Phase 5 - Sync conflict handling polish and audit reporting

---

8. Open Items
