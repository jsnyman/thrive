# Recycling Swap-Shop Basic Plan

Last updated: `2026-03-12`

---

## Overview

This project's aim is to create software that can be used by the actors involved in a recycling swap-shop. The swap-shop will be mobile and move between villages. The swap-shop will collect recyclable materials and "sell" items.

## Swap-Shop Flow

A swap-shop works as follows:

1. A person brings recyclable material to the collection point.
2. The material is inspected to determine type and suitability. It needs to be clean and acceptable.
3. The material is weighed.
4. The person provides their name and surname.
5. If they are not already registered, their details are captured:
   - Name
   - Surname
   - Address
   - Other notes about the person, for example family details in the case of children
6. The weight of each accepted recyclable material type is captured and entered into the software and associated with that person.
7. The backend works out how many points the person should receive and credits them to the person.
8. `1 point = 1 rand`, with point values stored to one decimal place and intake line calculations rounded down to the nearest `0.1` point.
9. A person who has credit in the system is allowed to buy from the swap-shop with the points accrued.
10. Shop items, previously captured in the system, are sold for points.

## Stock and Purchasing

The software should keep track of shop stock. All purchases should be captured with:

- The price paid
- The day purchased
- Where it was purchased

A purchase event should capture:

- The date
- Where the purchase was made
- What was bought
- What price was paid
- How far the trip was, for working out costs

The software should keep track of stock. Stock should be either:

- In storage
- In the shop
- Sold

## Recyclable Materials

The system also needs to keep track of all recyclable material. It should record:

- How much was collected
- At what "price" in points
- How much was collected at each location
- How much is in storage
- How much is later sold

---

# Project Plan (v1)

## Scope and Rules

- Multi-user system with asynchronous sync across devices
- Offline-first with event-log merge and audit trail
- Points are pegged to currency: `1 point = 1 rand`, with points stored to one decimal place and intake lines rounded down to the nearest `0.1`
- Items can only be bought with points; no cash sales
- Locations are free-form text; there is no fixed list
- No negative point balances; sales are blocked if points are insufficient
- Adjustments require a logged request; only managers can approve and apply them
- Overlapping edits are flagged for manager resolution

## Tech Stack Notes

- Postgres event log with Prisma schema in `apps/api/prisma/schema.prisma`
- Projections via Postgres materialized views refreshed after each accepted event write
- Hybrid inventory valuation:
  - Total cost is retained
  - Sellable cost excludes spoiled, damaged, and missing stock
  - Losses are tracked explicitly

## Primary Actors

- Collector: intake
- Shop operator: sales
- Manager: stock, procurement, expenses, reporting

## Core Entities

- Staff user: username and passcode with role-based access
- Person: name, surname, optional ID number, optional phone, address, notes
- Material type: points per kg as a rand-linked point value with one decimal place
- Intake event and intake lines: material type, weight, points
- Points ledger: credits from intake and debits from purchases
- Shop item: points price and cost price
- Inventory batches: `storage`, `shop`, `sold`, `spoiled`, `damaged`, `missing`
- Inventory status change log: batch movements and adjustments with reasons
- Procurement event and lines: cash cost and trip distance
- Expense entries: non-inventory costs
- Sale event and lines: points only

## Key Workflows

1. Register person.
2. Intake materials, validate, weigh, compute per-line points rounded down to the nearest `0.1`, and credit the person.
3. Record procurement and update inventory.
4. Redeem points through a sale, debit the person, and mark inventory as sold.
5. Record expenses such as fuel, labor, and repairs.
6. Produce reporting and audits.

## Reporting Outputs

- Cashflow summary: sales in points-as-rand, expenses, and net position
- Sales report: items sold, points spent, location, and date
- Expense report: totals by category, location, and date
- Points liability: total outstanding points and per-person balances
- Materials collected: by type, location, and date with points cost
- Inventory report: storage, shop, sold, spoiled, damaged, and missing counts and value
- Inventory status change report: who changed status, when, and why
- CSV export from the report views for sharing and offline review

## MVP Milestones

1. Person registry, intake, and points ledger with offline-first behavior
2. Inventory and points-only sales
3. Procurement and expense tracking
4. Reports and exports
5. Sync conflict handling polish and audit reporting
