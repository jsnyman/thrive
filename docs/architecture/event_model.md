# Event Model

This document defines the initial event model for an offline-first, event-sourced system with an append-only audit log.

Principles
- All business changes are recorded as immutable events.
- Events are appended locally first, then merged on the server.
- Projections are derived from events and can be rebuilt at any time.
- Corrections are new events, never edits to old events.

## Event Envelope

Each event shares a common envelope so it can be stored, synced, and audited consistently.

| Field | Purpose |
| --- | --- |
| `eventId` | Globally unique ID generated on the client (ULID or UUIDv7). |
| `eventType` | Namespaced type, for example `intake.recorded`. |
| `occurredAt` | Time on the device when the action happened. |
| `recordedAt` | Server time when the event was accepted. |
| `actorUserId` | Staff user who performed the action. |
| `deviceId` | Stable device identifier for sync and audit. |
| `locationText` | Free-form location text if applicable. |
| `schemaVersion` | Version of the event payload schema. |
| `payload` | Type-specific data for the event. |
| `correlationId` | Links related events (for example intake + ledger). |
| `causationId` | References the event that caused this one. |

Implementation note: the server stores events in Postgres via Prisma (`apps/api/prisma/schema.prisma`). Event types are a Postgres enum mapped to dotted names (e.g., `intake.recorded`). Projections are derived through materialized views refreshed after each sync batch.

Example event (illustrative)
```json
{
  "eventId": "01HZX9YB7R2S1G2M8C6QF2Y7G2",
  "eventType": "intake.recorded",
  "occurredAt": "2026-02-18T08:15:22Z",
  "recordedAt": null,
  "actorUserId": "user_123",
  "deviceId": "device_a7",
  "locationText": "Village A - Community Hall",
  "schemaVersion": 1,
  "correlationId": "corr_01HZX9YB7",
  "causationId": null,
  "payload": {
    "person_id": "person_456",
    "lines": [
      { "material_type_id": "mat_plastic", "weight_kg": 4.2, "points_awarded": 12 }
    ]
  }
}
```

## Core Event Types

Event names are examples and can evolve, but the categories should remain stable.

- `person.created`
- `person.profile_updated`
- `material_type.created`
- `material_type.updated`
- `item.created`
- `item.updated`
- `staff_user.created`
- `staff_user.role_changed`
- `intake.recorded`
- `sale.recorded`
- `procurement.recorded`
- `expense.recorded`
- `inventory.status_changed`
- `inventory.adjustment_requested`
- `inventory.adjustment_applied`
- `points.adjustment_requested`
- `points.adjustment_applied`
- `conflict.detected`
- `conflict.resolved`

## Projections

Projections are read models derived from the event log.

- Person registry projection uses `person.*` events.
- Points ledger and balance are derived from `intake.recorded`, `sale.recorded`, and `points.adjustment_applied`.
- Inventory status and quantities are derived from `procurement.recorded`, `sale.recorded`, and `inventory.status_changed`.
- Reports are derived from the same projections and never write back to the log.

## Corrections and Adjustments

Corrections are handled via explicit adjustment events.

- A request event captures the intent and reason from a non-manager.
- An applied event captures the manager decision and the exact delta.
- No event is deleted or mutated. The audit trail remains intact.

## PII Handling

ID numbers and phone numbers are stored in `person.*` events but are not displayed in standard interactions. Any explicit reveal must be a deliberate, role-gated action.
