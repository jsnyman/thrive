# Recycling Swap-Shop Software

## User Stories and Acceptance Criteria (v1)

Last updated: `2026-03-13`

---

## 1. Authentication and Roles

### US-1

As a staff user, I want to log in with a username and passcode so that only authorized users access the system.

Acceptance criteria:

- Login requires a valid username and passcode
- Invalid credentials do not allow access
- The session identifies the logged-in staff user

### US-2

As a manager, I want role-based permissions so that users can only access actions relevant to their role.

Acceptance criteria:

- Collector can register persons and record intake events
- Shop operator can record sales
- Manager can manage procurement, expenses, reports, and administration

---

## 2. Person Registry

### US-3

As a collector, I want to register a person with name and surname so that I can credit them for recycling.

Acceptance criteria:

- Name and surname are required
- The system assigns a unique internal ID

### US-4

As a collector, I want to store optional ID number, phone, address, and notes so that I can identify and assist people.

Acceptance criteria:

- Optional fields can be left blank
- Optional fields can be edited later
- ID numbers and phone numbers are not displayed during interactions
- Standard person API responses return masked ID and phone values by default

### US-5

As a staff user, I want to search and select existing persons so that I can avoid duplicates.

Acceptance criteria:

- Search supports name and surname
- Search results show a unique identifier

---

## 3. Material Intake and Points

### US-6

As a collector, I want to create an intake event with date/time and location so that the system records where materials are collected.

Acceptance criteria:

- Location is free-form text
- Date/time is recorded automatically and can be adjusted if needed

### US-7

As a collector, I want to add one or more material lines with type and weight so that points can be calculated.

Acceptance criteria:

- Each line requires a material type and weight
- Multiple lines can be added to one intake event

### US-8

As a collector, I want points calculated as `weight * points_per_kg`, rounded down to the nearest `0.1` point, so that rewards match the rules.

Acceptance criteria:

- Points can include exactly one decimal place
- Decimal results are rounded down to the nearest `0.1`

### US-9

As a collector, I want points to be credited to the person's account so that they can redeem them later.

Acceptance criteria:

- A points ledger entry is created per intake event
- The person's balance increases accordingly

---

## 4. Points Ledger

### US-10

As a staff user, I want to see a person's points balance so that I can confirm their available credit.

Acceptance criteria:

- Balance is derived from ledger entries
- Balance is displayed on the person's profile
- Transactions that would create a negative balance are blocked

### US-11

As a manager, I want each points change to reference its source event so that I can audit balances.

Acceptance criteria:

- Each ledger entry stores source type and source ID
- The source event is viewable from the ledger

---

## 5. Inventory and Items

### US-12

As a manager, I want to create items with points price and cost price so that I can manage stock and value.

Acceptance criteria:

- Item requires name and points price
- Cost price is recorded for reporting

### US-13

As a manager, I want to track stock status (`storage`, `shop`, `sold`, `spoiled`, `damaged`, `missing`) so that I know what is available.

Acceptance criteria:

- Stock can be moved between storage and shop
- Sold stock cannot be moved back without an adjustment event
- Stock can be marked as spoiled, damaged, or missing with an adjustment event
- Partial quantities can be moved to spoiled, damaged, or missing
- Each status change records date/time, staff user, quantity, and a free-text reason
- Only managers can perform inventory adjustments

---

## 6. Sales (Points Only)

### US-14

As a shop operator, I want to record a sale using points only so that redemption is tracked correctly.

Acceptance criteria:

- Payment type is points only
- Sale records include date/time and location

### US-15

As a shop operator, I want sales to debit the person's points balance so that the ledger stays accurate.

Acceptance criteria:

- A debit entry is created in the points ledger
- The person's balance decreases by the sale total

### US-16

As a shop operator, I want sales to reduce stock and mark items as sold so that inventory stays accurate.

Acceptance criteria:

- Inventory quantities decrease by sold quantity
- Sold status is recorded

---

## 7. Procurement

### US-17

As a manager, I want to record procurement events with date, location, and supplier so that I can track stock sources.

Acceptance criteria:

- Procurement events store date/time and location
- Supplier is optional

### US-18

As a manager, I want to record procurement lines with item, quantity, and unit cost so that I know the cost basis.

Acceptance criteria:

- Each line requires item and quantity
- Unit cost is stored as a cash value

### US-19

As a manager, I want procurement to increase stock so that inventory reflects new items.

Acceptance criteria:

- Inventory batches are created from procurement lines
- New stock defaults to `storage` status

### US-20

As a manager, I want to record trip distance so that I can understand logistical costs.

Acceptance criteria:

- Trip distance is optional
- Trip distance is stored in kilometers

---

## 8. Expenses

### US-21

As a manager, I want to record non-inventory expenses so that total cash outflows are tracked.

Acceptance criteria:

- Expense requires date/time, category, and amount
- Expense can include notes and receipt reference

### US-21a

As a staff user, I want to log an adjustment request so that a manager can correct a mistake.

Acceptance criteria:

- Request includes type, either points or inventory, and a free-text reason
- Request is linked to the affected person or inventory batch
- Request records who submitted it and when

### US-21b

As a manager, I want to approve and apply adjustments so that corrections are controlled.

Acceptance criteria:

- Only managers can apply adjustments
- Approved adjustments are logged with date/time and reason

---

## 9. Reporting

### US-22

As a manager, I want a materials collected report by type, location, and date so that I can measure recycling activity.

Acceptance criteria:

- Report includes total weight and points per material type
- Filters exist for date range and location

### US-23

As a manager, I want a points liability report so that I can see outstanding obligations.

Acceptance criteria:

- Total outstanding points are shown
- Per-person balances are included

### US-24

As a manager, I want an inventory report by status and value so that I can manage stock.

Acceptance criteria:

- Report shows `storage`, `shop`, `sold`, `spoiled`, `damaged`, and `missing` quantities
- Current implementation reports cost values for inventory status totals and detail rows; points valuation is deferred

### US-24a

As a manager, I want a status change log for inventory batches so that I can audit losses and movements.

Acceptance criteria:

- Log entries show batch, item, quantity, from status, and to status
- Log entries include date/time, staff user, and a free-text reason
- Report supports date and status filters and shows applied inventory movements only

### US-25

As a manager, I want a sales report by item, location, and date so that I can track redemption activity.

Acceptance criteria:

- Report includes totals by item and location
- Report can be filtered by date range

### US-26

As a manager, I want a cashflow report so that I can compare sales value and expenses.

Acceptance criteria:

- Sales are shown in rand equivalent of points
- Expenses are included and categorized
- Report can be filtered by date range and optional location

### US-26a

As a manager, I want to export report data so that I can share or review it outside the app.

Acceptance criteria:

- The currently loaded report rows can be exported to CSV
- Export is available from each manager report panel
- Export preserves the visible report structure for offline review

---

## 10. Sync and Audit

### US-27

As a staff user, I want to use the system offline so that work can continue without connectivity.

Acceptance criteria:

- All core workflows are available offline
- Events are queued locally

### US-28

As a manager, I want devices to sync asynchronously so that data is shared across users.

Acceptance criteria:

- Sync can be triggered manually or automatically
- Sync tolerates intermittent connections

### US-29

As a manager, I want an event-log merge with audit so that conflicts are resolved and changes are traceable.

Acceptance criteria:

- Conflicts produce an audit trail
- The system keeps all original events
- Overlapping edits are flagged for manager review
- Manager resolutions are logged with a free-text reason

### US-30

As a manager, I want reconciliation tooling that compares projections with the event log so that I can detect drift and apply audited corrective repairs.

Acceptance criteria:

- The system exposes a manager-only reconciliation report
- Reported issues include points balance mismatches, inventory summary mismatches, negative replay-derived inventory quantities, and projection cursor drift
- Repairable issues show a suggested fix and require manager notes before the repair runs
- Points and inventory repairs append immutable adjustment events instead of mutating history
- Projection repairs reuse the existing projection rebuild flow

### US-31

As a manager using a low-end device, I want report and reconciliation panels to load only when I open them so that login stays responsive.

Acceptance criteria:

- Manager login does not automatically fetch report or reconciliation endpoints
- Opening a manager report or reconciliation panel triggers its first load
- Reopening an already loaded panel does not refetch until the manager explicitly runs or refreshes it
