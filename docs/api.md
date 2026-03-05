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

### Ledger

- `GET /ledger/:personId/balance`
- `GET /ledger/:personId/entries`

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
  "lines": [{ "itemId": "uuid", "quantity": 2 }],
  "locationText": "Village A"
}
```

If balance would become negative, API returns `409` with `INSUFFICIENT_POINTS`.

### Sync

- `POST /sync/push`
- `GET /sync/pull?cursor=<cursor>&limit=<n>`
- `GET /sync/status`

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

Refresh order is implemented by:

- `apps/api/src/projections/refresh.ts`
