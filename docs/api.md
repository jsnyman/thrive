# API Endpoints (Current)

This document lists the current HTTP API endpoints available in `apps/api`.

## Runtime and Auth

- Runtime: Node HTTP server in `apps/api/src/http/server.ts`
- Auth token: bearer token returned by `POST /auth/login`
- Required environment variables:
  - `AUTH_SECRET` required
  - `AUTH_TOKEN_TTL_SECONDS` optional, default `3600`
  - `API_PORT` optional, default `3001`

## Auth Endpoints

### `POST /auth/login`

Request body:

```json
{
  "username": "manager",
  "passcode": "1234"
}
```

Success `200`:

```json
{
  "user": {
    "id": "uuid",
    "username": "manager",
    "role": "manager"
  },
  "token": "..."
}
```

Errors:

- `400`: malformed request body
- `401`: invalid credentials

### `GET /auth/me`

Requires `Authorization: Bearer <token>`.

Success `200`:

```json
{
  "user": {
    "id": "uuid",
    "username": "manager",
    "role": "manager"
  }
}
```

Errors:

- `401`: unauthorized
- `403`: forbidden, only if the route action is tightened beyond `person.update`

## Core Endpoints

All endpoints below require `Authorization: Bearer <token>`.

### People

Endpoints:

- `GET /people?search=<query>`
- `POST /people`
- `PATCH /people/:personId`

#### `GET /people?search=<query>`

Notes:

- Requires `person.read` permission
- Supports optional case-insensitive name/surname search
- Returns masked `idNumber` and `phone` values by default in standard person responses
- Does not expose raw sensitive person fields in normal interaction flows

#### `POST /people`

Request body:

```json
{
  "name": "Jane",
  "surname": "Doe",
  "idNumber": null,
  "phone": null,
  "address": null,
  "notes": null
}
```

#### `PATCH /people/:personId`

Request body:

```json
{
  "updates": {
    "name": "Jane",
    "surname": "Doe",
    "idNumber": "8001015009087",
    "phone": "0821234567",
    "address": "Village A",
    "notes": "Updated profile"
  },
  "locationText": "Village A"
}
```

Notes:

- `GET /people` requires `person.read` permission
- `POST /people` requires `person.create` permission
- Requires `person.update` permission
- `POST /people` and `PATCH /people/:personId` return masked `idNumber` and `phone` values in the echoed person payload
- Appends immutable `person.profile_updated` event
- Does not mutate or delete existing events
- Rejects empty updates or unknown fields with `400`
- Returns `404` when the person does not exist

### Materials

Endpoints:

- `GET /materials`
- `POST /materials` for managers only

#### `POST /materials`

Request body:

```json
{
  "name": "PET",
  "pointsPerKg": 2.3
}
```

### Items

Endpoints:

- `GET /items`
- `POST /items` for managers only

#### `POST /items`

Request body:

```json
{
  "name": "Soap",
  "pointsPrice": 15.4,
  "costPrice": 8.5,
  "sku": "SOAP-001"
}
```

### Inventory

Endpoints:

- `GET /inventory/status-summary` for shop operators and managers
- `GET /inventory/batches` for shop operators and managers
- `POST /inventory/status-changes` for shop operators and managers
- `POST /inventory/adjustments/requests` for collectors, shop operators, and managers

#### `GET /inventory/status-summary`

Success `200`:

```json
{
  "summary": [
    { "status": "storage", "totalQuantity": 10 },
    { "status": "shop", "totalQuantity": 4 }
  ]
}
```

#### `GET /inventory/batches`

Success `200`:

```json
{
  "batches": [
    {
      "inventoryBatchId": "batch-1",
      "itemId": "item-1",
      "quantities": {
        "storage": 6,
        "shop": 4,
        "sold": 0,
        "spoiled": 0,
        "damaged": 0,
        "missing": 0
      }
    }
  ]
}
```

#### `POST /inventory/status-changes`

Request body:

```json
{
  "inventoryBatchId": "batch-1",
  "fromStatus": "storage",
  "toStatus": "shop",
  "quantity": 4,
  "reason": "Move to shop",
  "notes": null
}
```

Underflow response `409`:

```json
{
  "error": "INVENTORY_UNDERFLOW",
  "availableQuantity": 10,
  "requestedQuantity": 99
}
```

#### `POST /inventory/adjustments/requests`

Request body:

```json
{
  "inventoryBatchId": "batch-1",
  "requestedStatus": "spoiled",
  "quantity": 1,
  "reason": "Packaging tear",
  "notes": null
}
```

### Ledger

Endpoints:

- `GET /ledger/:personId/balance`
- `GET /ledger/:personId/entries`

#### `GET /ledger/:personId/balance`

Success `200`:

```json
{
  "balance": {
    "personId": "uuid",
    "balancePoints": 38.7
  }
}
```

#### `GET /ledger/:personId/entries`

Success `200`:

```json
{
  "entries": [
    {
      "id": "uuid",
      "personId": "uuid",
      "deltaPoints": 8.7,
      "occurredAt": "2026-03-08T08:05:00.000Z",
      "sourceEventType": "intake.recorded",
      "sourceEventId": "uuid"
    }
  ]
}
```

### Intake

Endpoints:

- `POST /intakes` for collectors and managers

#### `POST /intakes`

Request body:

```json
{
  "personId": "uuid",
  "lines": [{ "materialTypeId": "uuid", "weightKg": 2.9 }],
  "locationText": "Village A"
}
```

### Sales

Endpoints:

- `POST /sales` for shop operators and managers

#### `POST /sales`

Request body:

```json
{
  "personId": "uuid",
  "lines": [{ "itemId": "uuid", "quantity": 2, "inventoryBatchId": "batch-1" }],
  "locationText": "Village A"
}
```

Notes:

- `inventoryBatchId` is optional on each line
- If omitted, the server allocates from available `shop` inventory batches for that item using FIFO order
- A single requested quantity can be split across multiple batches
- If balance would become negative, the API returns `409` with `INSUFFICIENT_POINTS`; point totals and balances are returned as numeric values with one decimal place
- If stock is insufficient, the API returns `409` with `INSUFFICIENT_STOCK` and includes `itemId`, `requiredQuantity`, and `availableQuantity`

### Procurement

Endpoints:

- `POST /procurements` for managers only
- `POST /procurements/bulk` for managers only

#### `POST /procurements`

Request body:

```json
{
  "supplierName": "Village Supplier",
  "tripDistanceKm": 12,
  "lines": [{ "itemId": "uuid", "quantity": 2, "unitCost": 3 }],
  "locationText": "Village A"
}
```

Notes:

- Request lines do not include `inventoryBatchId`; the server generates batch IDs
- `cashTotal` is computed as the sum of `lineTotalCost`, which is `quantity * unitCost`, across lines
- Success `201` returns `eventId`, `cashTotal`, and generated line details

Errors:

- `400 BAD_REQUEST`: invalid payload
- `404 ITEM_NOT_FOUND`: unknown `itemId`
- `401/403`: authentication or permission failures

#### `POST /procurements/bulk`

Request body:

```json
{
  "supplierName": "Makro Online",
  "tripDistanceKm": 0,
  "rows": [
    {
      "productName": "Soap",
      "quantity": 24,
      "lineTotalCost": 72
    }
  ],
  "locationText": "Village A"
}
```

Notes:

- Designed for spreadsheet-style bulk capture by product name
- `productName` must match an existing item name exactly
- Spreadsheet mapping is:
  - `Units per pack` -> `quantity`
  - `Cost per pack` -> `lineTotalCost`
  - `Price per unit` is not accepted by this endpoint
- `lineTotalCost` is required and recorded as the source-of-truth total paid for the row
- The server resolves each row to `itemId`, generates `inventoryBatchId`, derives `unitCost = lineTotalCost / quantity`, and appends one standard `procurement.recorded` event
- `cashTotal` is computed as the sum of provided `lineTotalCost` values across all rows
- Success `201` returns `eventId`, `cashTotal`, and normalized generated line details

Errors:

- `400 BAD_REQUEST`: invalid payload
- `400 ITEM_NOT_FOUND`: one or more `productName` values did not resolve; response includes row indexes and names
- `401/403`: authentication or permission failures

### Expenses

Endpoints:

- `POST /expenses` for managers only

#### `POST /expenses`

Request body:

```json
{
  "category": "Fuel",
  "cashAmount": 99.5,
  "notes": "Round trip collection",
  "receiptRef": "RCPT-1",
  "locationText": "Village A"
}
```

Notes:

- Appends immutable `expense.recorded` on success
- Success `201` returns `eventId` and a normalized `expense` payload

Errors:

- `400 BAD_REQUEST`: invalid payload
- `401/403`: authentication or permission failures

### Reports

Endpoints:

- `GET /reports/materials-collected` for managers only, requires `reports.view`
- `GET /reports/points-liability` for managers only, requires `reports.view`
- `GET /reports/sales` for managers only, requires `reports.view`
- `GET /reports/cashflow` for managers only, requires `reports.view`
- `GET /reports/inventory-status` for managers only, requires `reports.view`
- `GET /reports/inventory-status-log` for managers only, requires `reports.view`

Query params:

- `fromDate` optional, format `YYYY-MM-DD`, inclusive lower bound
- `toDate` optional, format `YYYY-MM-DD`, inclusive upper bound
- `locationText` optional, case-insensitive substring filter
- `materialTypeId` optional, exact filter

If both `fromDate` and `toDate` are omitted, the API applies a default last-30-days range based on server time.

Success `200`:

```json
{
  "rows": [
    {
      "day": "2026-03-08",
      "materialTypeId": "mat-1",
      "materialName": "PET",
      "locationText": "Village A",
      "totalWeightKg": 12.5,
      "totalPoints": 28.7
    }
  ],
  "appliedFilters": {
    "fromDate": "2026-02-08",
    "toDate": "2026-03-09",
    "locationText": null,
    "materialTypeId": null
  }
}
```

Errors:

- `400 BAD_REQUEST`: invalid date format or `fromDate > toDate`
- `401/403`: authentication or permission failures

#### `GET /reports/points-liability`

Query params:

- `search` optional, case-insensitive substring filter against person name or surname

Success `200`:

```json
{
  "rows": [
    {
      "personId": "person-1",
      "name": "Jane",
      "surname": "Doe",
      "balancePoints": 38.7
    }
  ],
  "summary": {
    "totalOutstandingPoints": 38.7,
    "personCount": 1
  },
  "appliedFilters": {
    "search": null
  }
}
```

Notes:

- Only people with positive balances are included
- `summary.totalOutstandingPoints` is the total for the filtered rows currently returned
- Rows are ordered by highest balance first, then surname, then name, then person ID

Errors:

- `401/403`: authentication or permission failures

#### `GET /reports/sales`

Query params:

- `fromDate` optional, format `YYYY-MM-DD`, inclusive lower bound
- `toDate` optional, format `YYYY-MM-DD`, inclusive upper bound
- `locationText` optional, case-insensitive substring filter
- `itemId` optional, exact item filter

If both `fromDate` and `toDate` are omitted, the API applies a default last-30-days range based on server time.

Success `200`:

```json
{
  "rows": [
    {
      "day": "2026-03-08",
      "itemId": "item-1",
      "itemName": "Soap",
      "locationText": "Village A",
      "totalQuantity": 5,
      "totalPoints": 52.5,
      "saleCount": 2
    }
  ],
  "summary": {
    "totalQuantity": 5,
    "totalPoints": 52.5,
    "saleCount": 2
  },
  "appliedFilters": {
    "fromDate": "2026-02-08",
    "toDate": "2026-03-09",
    "locationText": null,
    "itemId": null
  }
}
```

Notes:

- Rows are grouped by sale day, item, and event location
- `totalPoints` is summed from sale-line `lineTotalPoints`
- `saleCount` is the number of distinct `sale.recorded` events represented in each row
- Rows are ordered by `day desc`, then `locationText asc`, then `itemName asc`, then `itemId asc`
- When a sale event has no location text, the report returns `"Unknown"` for grouping and display

Errors:

- `400 BAD_REQUEST`: invalid date format or `fromDate > toDate`
- `401/403`: authentication or permission failures

#### `GET /reports/cashflow`

Query params:

- `fromDate` optional, format `YYYY-MM-DD`, inclusive lower bound
- `toDate` optional, format `YYYY-MM-DD`, inclusive upper bound
- `locationText` optional, case-insensitive substring filter

If both `fromDate` and `toDate` are omitted, the API applies a default last-30-days range based on server time.

Success `200`:

```json
{
  "rows": [
    {
      "day": "2026-03-08",
      "salesPointsValue": 52.5,
      "expenseCashTotal": 18.5,
      "netCashflow": 34.0,
      "saleCount": 2,
      "expenseCount": 1
    }
  ],
  "summary": {
    "totalSalesPointsValue": 52.5,
    "totalExpenseCash": 18.5,
    "netCashflow": 34.0,
    "saleCount": 2,
    "expenseCount": 1
  },
  "expenseCategories": [
    {
      "category": "Fuel",
      "totalCashAmount": 18.5,
      "expenseCount": 1
    }
  ],
  "appliedFilters": {
    "fromDate": "2026-02-08",
    "toDate": "2026-03-09",
    "locationText": null
  }
}
```

Notes:

- Rows are grouped by event day and include days with sales only, expenses only, or both
- Sales inflow comes from `sale.recorded.payload.totalPoints` as points-as-rand
- Expense outflow comes only from `expense.recorded.payload.cashAmount`
- Procurement is excluded from this report
- `netCashflow` is `salesPointsValue - expenseCashTotal`
- `expenseCategories` are computed from the filtered expense events and ordered by highest total first

Errors:

- `400 BAD_REQUEST`: invalid date format or `fromDate > toDate`
- `401/403`: authentication or permission failures

#### `GET /reports/inventory-status`

Success `200`:

```json
{
  "summary": [
    {
      "status": "storage",
      "totalQuantity": 10,
      "totalCostValue": 42.5
    },
    {
      "status": "shop",
      "totalQuantity": 4,
      "totalCostValue": 17
    },
    {
      "status": "sold",
      "totalQuantity": 0,
      "totalCostValue": 0
    },
    {
      "status": "spoiled",
      "totalQuantity": 0,
      "totalCostValue": 0
    },
    {
      "status": "damaged",
      "totalQuantity": 0,
      "totalCostValue": 0
    },
    {
      "status": "missing",
      "totalQuantity": 0,
      "totalCostValue": 0
    }
  ],
  "rows": [
    {
      "status": "storage",
      "itemId": "item-1",
      "itemName": "Soap",
      "quantity": 10,
      "unitCost": 4.25,
      "totalCostValue": 42.5
    }
  ]
}
```

Notes:

- Summary always includes all six inventory statuses, even when totals are zero
- Detail rows include only item and status combinations with positive current quantity
- Values are cost-based only for now; points valuation is not included in this report
- Rows are ordered by status, then item name, then item ID

Errors:

- `401/403`: authentication or permission failures

#### `GET /reports/inventory-status-log`

Query params:

- `fromDate` optional, format `YYYY-MM-DD`, inclusive lower bound on event date
- `toDate` optional, format `YYYY-MM-DD`, inclusive upper bound on event date
- `fromStatus` optional, one of `storage|shop|sold|spoiled|damaged|missing`
- `toStatus` optional, one of `storage|shop|sold|spoiled|damaged|missing`

If both `fromDate` and `toDate` are omitted, the API applies a default last-30-days range based on server time.

Success `200`:

```json
{
  "rows": [
    {
      "eventId": "evt-1",
      "eventType": "inventory.status_changed",
      "occurredAt": "2026-03-08T10:00:00.000Z",
      "inventoryBatchId": "batch-1",
      "itemId": "item-1",
      "itemName": "Soap",
      "fromStatus": "storage",
      "toStatus": "shop",
      "quantity": 4,
      "reason": "Move to shop",
      "notes": null
    }
  ],
  "appliedFilters": {
    "fromDate": "2026-02-08",
    "toDate": "2026-03-09",
    "fromStatus": null,
    "toStatus": null
  }
}
```

Notes:

- Includes only applied inventory movement events: `inventory.status_changed` and `inventory.adjustment_applied`
- Excludes pending `inventory.adjustment_requested` events
- Rows are ordered by `occurredAt desc`, then `eventId desc`
- `itemId` and `itemName` are best-effort resolved from the current batch mapping and may be `null`

Errors:

- `400 BAD_REQUEST`: invalid date format, invalid status value, or `fromDate > toDate`
- `401/403`: authentication or permission failures

### Sync

Endpoints:

- `POST /sync/push`
- `GET /sync/pull?cursor=<cursor>&limit=<n>`
- `GET /sync/status`
- `GET /sync/conflicts?status=open|all&limit=<n>&cursor=<cursor>` for managers only
- `POST /sync/conflicts/:conflictId/resolve` for managers only
- `GET /sync/audit/report?limit=<n>&cursor=<cursor>` for managers only
- `GET /sync/audit/event/:eventId` for managers only
- `GET /sync/reconciliation/report?limit=<n>&cursor=<cursor>&code=<issueCode>&repairableOnly=true|false` for managers only
- `POST /sync/reconciliation/issues/:issueId/repair` for managers only

#### `POST /sync/push`

Request body:

```json
{
  "events": [
    {
      "eventId": "uuid",
      "eventType": "person.created",
      "occurredAt": "2026-03-05T12:00:00.000Z",
      "actorUserId": "uuid",
      "deviceId": "device-1",
      "schemaVersion": 1,
      "payload": {
        "personId": "uuid",
        "name": "A",
        "surname": "B"
      }
    }
  ],
  "lastKnownCursor": null
}
```

#### `GET /sync/status`

Returns the current event cursor and projection freshness cursor.

#### `GET /sync/conflicts`

Returns unresolved, or all, conflict records sourced from `conflict.detected` and the latest matching `conflict.resolved` events.

#### `POST /sync/conflicts/:conflictId/resolve`

Request body:

```json
{
  "resolution": "merged",
  "notes": "Manual merge after review",
  "resolvedEventId": null,
  "relatedEventIds": null
}
```

Resolve errors:

- `400`: malformed body
- `404`: conflict not found with code `CONFLICT_NOT_FOUND`
- `409`: conflict already resolved with code `ALREADY_RESOLVED`

#### `GET /sync/audit/report`

Returns integrity issues derived from `event` and `projection_freshness`, including missing references, duplicate conflict IDs and resolutions, and projection cursor anomalies.

#### `GET /sync/audit/event/:eventId`

Returns the event envelope plus linked conflict and resolution metadata for audit traceability.

#### `GET /sync/reconciliation/report`

Returns reconciliation issues derived by comparing projection state with event-log replay.

Query params:

- `limit` optional, default `50`, max `200`
- `cursor` optional, cursor for pagination
- `code` optional, exact issue-code filter
- `repairableOnly` optional boolean filter

Success `200`:

```json
{
  "generatedAt": "2026-03-12T12:00:00.000Z",
  "summary": {
    "totalIssues": 3,
    "errorCount": 2,
    "warningCount": 1,
    "repairableCount": 3
  },
  "issues": [
    {
      "issueId": "POINTS_BALANCE_MISMATCH:person-1",
      "code": "POINTS_BALANCE_MISMATCH",
      "severity": "error",
      "entityType": "person",
      "entityId": "person-1",
      "detail": "Projected balance does not match event-log balance.",
      "detectedAt": "2026-03-12T12:00:00.000Z",
      "expected": { "balancePoints": 38.7 },
      "actual": { "balancePoints": 35.7 },
      "suggestedRepair": {
        "repairKind": "points_adjustment",
        "deltaPoints": 3.0,
        "reasonTemplate": "Reconciliation correction for points balance mismatch"
      }
    }
  ],
  "nextCursor": null
}
```

Notes:

- Current issue codes are `POINTS_BALANCE_MISMATCH`, `INVENTORY_STATUS_SUMMARY_MISMATCH`, `INVENTORY_BATCH_NEGATIVE_QUANTITY`, and `PROJECTION_CURSOR_DRIFT`
- Suggested repairs are append-only corrective adjustment events or a projection rebuild
- The report is the source of truth; issue state is recomputed on each request

Errors:

- `400 BAD_REQUEST`: invalid `code` or `repairableOnly`
- `401/403`: authentication or permission failures

#### `POST /sync/reconciliation/issues/:issueId/repair`

Request body:

```json
{
  "notes": "Verified against intake and sale history"
}
```

Success `200` for adjustment repairs:

```json
{
  "issueId": "POINTS_BALANCE_MISMATCH:person-1",
  "repairKind": "points_adjustment",
  "repairEventId": "uuid"
}
```

Success `200` for rebuild repairs:

```json
{
  "issueId": "PROJECTION_CURSOR_DRIFT:default",
  "repairKind": "projection_rebuild",
  "rebuiltAt": "2026-03-12T12:01:00.000Z"
}
```

Notes:

- Repair requests are manager-confirmed and require non-empty `notes`
- The server recomputes the targeted issue before applying the repair
- Business-data repairs append immutable `points.adjustment_applied` or `inventory.adjustment_applied` events
- Projection repairs reuse the existing projection refresh path

Errors:

- `400 BAD_REQUEST`: malformed body
- `404 NOT_FOUND`: issue no longer exists or is no longer repairable
- `409 CONFLICT`: repair could not be safely applied against current state

## Operational Commands

- Start API: `npm run start:api`
- Seed staff users: `npm run seed:staff`
- Install projections: `npm run projections:install`

### Seed Staff Users

Default seed set, used when `STAFF_SEED_JSON` is not provided:

- `manager / 1234 / manager`
- `collector / 1234 / collector`
- `operator / 1234 / shop_operator`

Custom seed input:

```powershell
$env:STAFF_SEED_JSON='[{"username":"admin","passcode":"9876","role":"manager"}]'
npm run seed:staff
```

## Projections

Materialized views are defined in:

- `apps/api/prisma/projections.sql`

Current views:

- `mv_people`
- `mv_points_ledger_entries`
- `mv_points_balances`
- `mv_inventory_status_summary`
- `mv_materials_collected_daily`
- `projection_freshness` table, which tracks refresh timestamp and latest projected cursor

Point-valued request and response fields remain JSON numbers. The API normalizes them to one decimal place where applicable, for example `5.3`, `20.0`, and `33299.2`.

## Web Behavior Notes

- Current web person-registry interaction views mask ID number and phone by default using partial `****`-style masking
- Report export is currently implemented in the web app as client-side CSV downloads from the loaded report data; there is no separate HTTP export endpoint yet

Refresh order is implemented in:

- `apps/api/src/projections/refresh.ts`
