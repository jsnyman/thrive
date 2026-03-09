This project's aim is to create software that can be used by the actors involved in a recycling swap-shop. The swap-shop will be mobile and moving between villages. The swap-shop will collect recyclable materials and "sell" items.

A swap-shop works as follows: - A person brings recyclable material to the collection point - The material is inspected to determine type and suitability (it needs to be clean etc) - The material is weighed - The person provides their name and surname. If they are not already registered, their details will be captured (name, surname, address and any other notes about the person (in case of children things like family members for instance)) - The weight of each type of accepted recyclable material is captured and entered into the software and associated with that person - The back-end then works out how many points the person should receive and credits them to the person (1 point = 1 rand, rounded down to whole rand) - A person who has credit in the system is allowed to buy from the swap shop with the points accrued. Shop items (prevbiously capture in the system) is sold for the points.

The software should keep track of shop stock. All purchases should be captured with the price paid, day purchased and where it was purchased. A purchase event should capture the date, where the purchase was made, what was bought at what price and how far the trip was (for working out costs). The software should keep track of stock. The stock should be either in storage, in the shop o r sold.

We also need to keep track of all the recyclable material. We need to know how much was collected and at what "price" (number of points). We need to keep track of how much was collected where and how much is either in storage, and then later sold.

---

Project plan (v1)

Scope and rules - Multi-user system with asynchronous sync across devices - Offline-first with event-log merge and audit trail - Points are pegged to currency: 1 point = 1 rand, rounded down to whole rand - Items can only be bought with points (no cash sales) - Locations are free-form text (no fixed list) - No negative point balances; sales are blocked if insufficient points - Adjustments require a logged request; only managers can approve and apply - Overlapping edits are flagged for manager resolution
Tech stack notes - Postgres event log with Prisma schema (`apps/api/prisma/schema.prisma`) - Projections via Postgres materialized views refreshed after each accepted event write (current behavior) - Hybrid inventory valuation: total cost kept; sellable cost excludes spoiled/damaged/missing; losses tracked explicitly

Primary actors - Collector (intake) - Shop operator (sales) - Manager (stock, procurement, expenses, reporting)

Core entities - Staff user: username + passcode (role-based access) - Person: name, surname, optional ID number, optional phone, address, notes - Material type: points per kg (integer rand) - Intake event + intake lines (material type, weight, points) - Points ledger (credits from intake, debits from purchases) - Shop item (points price, cost price) - Inventory batches (storage / shop / sold / spoiled / damaged / missing) - Inventory status change log (batch movements and adjustments with reasons) - Procurement event + lines (cash cost, trip distance) - Expense entries (non-inventory costs) - Sale event + lines (points only)

Key workflows 1) Register person 2) Intake materials -> validate -> weigh -> compute points (rounded down) -> credit person 3) Record procurement -> update inventory 4) Redeem points -> sale -> debit person -> mark inventory sold 5) Record expenses (fuel, labor, repairs) 6) Reporting and audits

Reporting outputs - Cashflow summary: sales (points as rand), expenses, net position - Sales report: items sold, points spent, location, date - Expense report: totals by category, location, date - Points liability: total points outstanding and per-person balances - Materials collected: by type, location, date with points cost - Inventory report: storage/shop/sold/spoiled/damaged/missing counts and value (cost vs points) - Inventory status change report: who changed status, when, and why

MVP milestones 1) Person registry + intake + points ledger (offline-first) 2) Inventory + points-only sales 3) Procurement + expense tracking 4) Reports + exports 5) Sync conflict handling polish and audit reporting
