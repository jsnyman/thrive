# API Endpoints (Current)

This document lists the current HTTP API endpoints available in `apps/api`.

## Runtime and Auth

- Runtime: Node HTTP server in `apps/api/src/http/server.ts`
- Auth token: Bearer token returned by `POST /auth/login`
- Required env vars:
  - `AUTH_SECRET` (required)
  - `AUTH_TOKEN_TTL_SECONDS` (optional, default `3600`)
  - `API_PORT` (optional, default `3001`)

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

- `400` malformed request body
- `401` invalid credentials

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

- `401` unauthorized
- `403` forbidden (only if route required action is tightened beyond `person.update`)

## Core Endpoints

All endpoints below require `Authorization: Bearer <token>`.

### People

- `GET /people?search=<query>`
- `POST /people`
- `PATCH /people/:personId`

`POST /people` body:

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

`PATCH /people/:personId` body:

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

`PATCH /people/:personId` notes:

- Requires `person.update` permission.
- Appends immutable `person.profile_updated` event (no event mutation/delete).
- Rejects empty updates or unknown update fields with `400`.
- Returns `404` when person does not exist.

### Materials

- `GET /materials`
- `POST /materials` (manager only)

`POST /materials` body:

```json
{
  "name": "PET",
  "pointsPerKg": 2
}
```

### Items

- `GET /items`
- `POST /items` (manager only)

`POST /items` body:

```json
{
  "name": "Soap",
  "pointsPrice": 15,
  "costPrice": 8.5,
  "sku": "SOAP-001"
}
```

### Inventory

- `GET /inventory/status-summary` (shop operator and manager)
- `GET /inventory/batches` (shop operator and manager)
- `POST /inventory/status-changes` (shop operator and manager)
- `POST /inventory/adjustments/requests` (collector, shop operator, manager)

`GET /inventory/status-summary` success `200`:

```json
{
  "summary": [
    { "status": "storage", "totalQuantity": 10 },
    { "status": "shop", "totalQuantity": 4 }
  ]
}
```

`GET /inventory/batches` success `200`:

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

`POST /inventory/status-changes` body:

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

`POST /inventory/adjustments/requests` body:

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

- `GET /ledger/:personId/balance`
- `GET /ledger/:personId/entries`

`GET /ledger/:personId/balance` success `200`:

```json
{
  "balance": {
    "personId": "uuid",
    "balancePoints": 38
  }
}
```

`GET /ledger/:personId/entries` success `200`:

```json
{
  "entries": [
    {
      "id": "uuid",
      "personId": "uuid",
      "deltaPoints": 8,
      "occurredAt": "2026-03-08T08:05:00.000Z",
      "sourceEventType": "intake.recorded",
      "sourceEventId": "uuid"
    }
  ]
}
```

### Intake

- `POST /intakes` (collector and manager)

`POST /intakes` body:

```json
{
  "personId": "uuid",
  "lines": [{ "materialTypeId": "uuid", "weightKg": 2.9 }],
  "locationText": "Village A"
}
```

### Sales

- `POST /sales` (shop operator and manager)

`POST /sales` body:

```json
{
  "personId": "uuid",
  "lines": [{ "itemId": "uuid", "quantity": 2, "inventoryBatchId": "batch-1" }],
  "locationText": "Village A"
}
```

`inventoryBatchId` is optional on each line. If omitted, the server allocates from available `shop` inventory batches for that item using FIFO order and can split one requested quantity across multiple batches.

If balance would become negative, API returns `409` with `INSUFFICIENT_POINTS`.

If stock is insufficient, API returns `409` with `INSUFFICIENT_STOCK` and includes `itemId`, `requiredQuantity`, and `availableQuantity`.

### Procurement

- `POST /procurements` (manager only)

`POST /procurements` body:

```json
{
  "supplierName": "Village Supplier",
  "tripDistanceKm": 12,
  "lines": [{ "itemId": "uuid", "quantity": 2, "unitCost": 3 }],
  "locationText": "Village A"
}
```

`POST /procurements` notes:

- Request lines do not include `inventoryBatchId`; server generates batch IDs.
- `cashTotal` is computed as sum of `lineTotalCost` (`quantity * unitCost`) across lines.
- Success `201` response returns `eventId`, `cashTotal`, and generated line details.
- Errors:
  - `400 BAD_REQUEST` invalid payload
  - `404 ITEM_NOT_FOUND` unknown `itemId`
  - `401/403` auth/permission failures

### Expenses

- `POST /expenses` (manager only)

`POST /expenses` body:

```json
{
  "category": "Fuel",
  "cashAmount": 99.5,
  "notes": "Round trip collection",
  "receiptRef": "RCPT-1",
  "locationText": "Village A"
}
```

`POST /expenses` notes:

- Appends immutable `expense.recorded` event on success.
- Success `201` response returns `eventId` and normalized `expense` payload.
- Errors:
  - `400 BAD_REQUEST` invalid payload
  - `401/403` auth/permission failures

### Sync

- `POST /sync/push`
- `GET /sync/pull?cursor=<cursor>&limit=<n>`
- `GET /sync/status`
- `GET /sync/conflicts?status=open|all&limit=<n>&cursor=<cursor>` (manager only)
- `POST /sync/conflicts/:conflictId/resolve` (manager only)
- `GET /sync/audit/report?limit=<n>&cursor=<cursor>` (manager only)
- `GET /sync/audit/event/:eventId` (manager only)

`POST /sync/push` body:

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

`GET /sync/status` returns current event cursor and projection freshness cursor.

`GET /sync/conflicts` returns unresolved (or all) conflict records sourced from `conflict.detected` and latest matching `conflict.resolved` events.

`POST /sync/conflicts/:conflictId/resolve` body:

```json
{
  "resolution": "merged",
  "notes": "Manual merge after review",
  "resolvedEventId": null,
  "relatedEventIds": null
}
```

Resolve errors:

- `400` malformed body
- `404` conflict not found (`CONFLICT_NOT_FOUND`)
- `409` already resolved (`ALREADY_RESOLVED`)

`GET /sync/audit/report` returns integrity issues derived from `event` and `projection_freshness` (missing references, duplicate conflict IDs/resolutions, projection cursor anomalies).

`GET /sync/audit/event/:eventId` returns the event envelope plus linked conflict/resolution metadata for audit traceability.

## Operational Commands

- Start API: `npm run start:api`
- Seed staff users: `npm run seed:staff`
- Install projections: `npm run projections:install`

### Seed Staff Users

Default seed set is used when `STAFF_SEED_JSON` is not provided:

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
- `projection_freshness` table tracks refresh timestamp and latest projected cursor.

## Web Behavior Notes

- Current web person-registry interaction views mask ID number and phone by default (`****`-style partial masking).

Refresh order is implemented by:

- `apps/api/src/projections/refresh.ts`
